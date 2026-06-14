import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Slice 3b — Bacteriostatic Water, sold as a real catalog product AND offered
 * as a buy-box add-on checkbox on peptide PDPs (the storefront wires the add-on
 * by fetching this product's default variant).
 *
 *   npm run bac:seed
 *
 * IDEMPOTENT by handle. Prereq: base catalog seeded (`npm run seed`).
 *
 * RUO framing kept consistent with the rest of the catalog: a reconstitution
 * solvent for laboratory research, NOT for injection or human/veterinary use.
 */
const HANDLE = "bacteriostatic-water"
const SKU = "BACWATER-30ML"
const PRICE = 20 // USD major units (Medusa v2: 20 = $20, not cents)

export default async function seedBacWater({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

  const [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })
  const [shippingProfile] =
    await fulfillmentModuleService.listShippingProfiles({ type: "default" })
  const { data: locs } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: "US Warehouse" },
  })
  const stockLocation = locs?.[0]
  if (!salesChannel || !shippingProfile || !stockLocation) {
    throw new Error(
      "Base catalog not found (sales channel / shipping profile / stock location). Run `npm run seed` first."
    )
  }

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: HANDLE },
  })
  let product = existing?.[0]

  if (!product) {
    logger.info("Creating Bacteriostatic Water product…")
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Bacteriostatic Water",
            subtitle: "0.9% Benzyl Alcohol · Reconstitution Solvent",
            handle: HANDLE,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            description:
              "Sterile bacteriostatic water (0.9% benzyl alcohol) for reconstituting lyophilized research peptides in the laboratory. The benzyl alcohol allows multiple aseptic withdrawals from a single vial. Supplied strictly for research use only — not a drug or medical device, and not for injection or human or veterinary use.",
            sales_channels: [{ id: salesChannel.id }],
            metadata: {
              format: "Sterile Solution",
              made_in: "USA",
              volume_ml: 30,
              research_use_only: true,
            },
            options: [{ title: "Size", values: ["30 mL"] }],
            variants: [
              {
                title: "30 mL",
                sku: SKU,
                options: { Size: "30 mL" },
                manage_inventory: true,
                prices: [{ amount: PRICE, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
    product = result[0]
    logger.info(`Created product ${product.id} (handle: ${HANDLE}).`)
  } else {
    logger.info(`Product "${HANDLE}" already exists (${product.id}), reusing.`)
  }

  // Inventory level at the warehouse for the variant (if missing).
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku", "location_levels.location_id"],
    filters: { sku: SKU },
  })
  const newLevels: CreateInventoryLevelInput[] = (inventoryItems ?? [])
    .filter(
      (item: any) =>
        !item.location_levels?.some(
          (l: any) => l.location_id === stockLocation.id
        )
    )
    .map((item: { id: string }) => ({
      location_id: stockLocation.id,
      stocked_quantity: 100000,
      inventory_item_id: item.id,
    }))
  if (newLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: newLevels },
    })
    logger.info(`Created ${newLevels.length} inventory level(s) for BAC water.`)
  }

  logger.info(`Done. Bacteriostatic Water at /us/products/${HANDLE} — $${PRICE}.`)
}
