import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductVariantsWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { TIERS, tierPrice } from "../../../../../lib/volume-tiers"

/**
 * POST /admin/products/:id/add-size
 *
 * One-shot "add a new size" for the admin Variants widget — the stock variant
 * form is select-only, so this does the FULL lifecycle a usable size needs:
 *   1. add the value to the product's "Size" option (so the variant can use it)
 *   2. create the variant (SKU + USD price, manage_inventory)
 *   3. stock it at the US Warehouse (else it renders out-of-stock)
 *   4. apply the per-vial volume tiers (else a fresh variant has no discounts)
 *
 * Body: { size: "100 mg", sku: "RETA-100MG", price: 600, quantity?: 100000 }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const body = (req.body ?? {}) as Record<string, any>
  const size = String(body.size ?? "").trim()
  const sku = String(body.sku ?? "").trim()
  const price = Number(body.price)
  const stockQty = body.quantity != null ? Number(body.quantity) : 100000

  if (!size || !sku || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ message: "size, sku, and a positive price are required" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // ── Resolve product + its "Size" option + existing variants ────────────────
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "options.id", "options.title", "options.values.value", "variants.sku"],
    filters: { id: productId },
  })
  const product = products?.[0]
  if (!product) return res.status(404).json({ message: "Product not found" })

  const sizeOption = (product.options ?? []).find((o: any) => o.title === "Size")
  if (!sizeOption) {
    return res.status(400).json({ message: 'This product has no "Size" option to extend.' })
  }
  const existingValues: string[] = (sizeOption.values ?? []).map((v: any) => v.value)
  if (existingValues.includes(size)) {
    return res.status(400).json({ message: `Size "${size}" already exists on this product.` })
  }
  if ((product.variants ?? []).some((v: any) => v.sku === sku)) {
    return res.status(400).json({ message: `SKU "${sku}" is already in use on this product.` })
  }

  // ── 1. Add the value to the Size option ────────────────────────────────────
  await updateProductOptionsWorkflow(req.scope).run({
    input: { selector: { id: sizeOption.id }, update: { values: [...existingValues, size] } },
  })

  // ── 2. Create the variant (SKU + USD price, inventory-managed) ─────────────
  const { result: variants } = await createProductVariantsWorkflow(req.scope).run({
    input: {
      product_variants: [
        {
          product_id: productId,
          title: size,
          sku,
          options: { Size: size },
          manage_inventory: true,
          prices: [{ amount: price, currency_code: "usd" }],
        },
      ],
    },
  })
  const variant = Array.isArray(variants) ? variants[0] : variants

  // ── 3. Stock it at the US Warehouse ────────────────────────────────────────
  const [{ data: locs }, { data: invItems }] = await Promise.all([
    query.graph({ entity: "stock_location", fields: ["id", "name"], filters: { name: "US Warehouse" } }),
    query.graph({ entity: "inventory_item", fields: ["id", "sku", "location_levels.location_id"], filters: { sku } }),
  ])
  const location = locs?.[0]
  const invItem = invItems?.[0]
  let stocked = false
  if (location && invItem) {
    // The variant-stock-init subscriber may have already seeded a qty-0 level for
    // this item — update it instead of creating a duplicate (else a race throws).
    const existingLevel = (invItem.location_levels ?? []).some((l: any) => l.location_id === location.id)
    if (existingLevel) {
      await updateInventoryLevelsWorkflow(req.scope).run({
        input: { updates: [{ inventory_item_id: invItem.id, location_id: location.id, stocked_quantity: stockQty }] },
      })
    } else {
      await createInventoryLevelsWorkflow(req.scope).run({
        input: { inventory_levels: [{ inventory_item_id: invItem.id, location_id: location.id, stocked_quantity: stockQty }] },
      })
    }
    stocked = true
  }

  // ── 4. Volume tiers are applied by the variant-tiers-init subscriber (the
  //       SOLE tier applier — applying here too would race its remove-then-add on
  //       the same price set and produce duplicate tier prices). It fires on the
  //       variant.created event this workflow just emitted.
  const tiered = true

  res.json({
    variant: { id: variant.id, title: variant.title, sku },
    size,
    price,
    stocked,
    tiered,
    tiers: TIERS.map((t) => ({ range: t.maxQty ? `${t.minQty}-${t.maxQty}` : `${t.minQty}+`, price: tierPrice(price, t.pct) })),
  })
}
