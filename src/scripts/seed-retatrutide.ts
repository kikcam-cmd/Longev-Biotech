import fs from "fs"
import path from "path"
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
import { LOT_COA_MODULE } from "../modules/lot-coa"

/**
 * Stand up the Retatrutide product + its current lot + attach a Certificate of
 * Analysis — so the PDP "This Batch's Lab Report" hero populates with real data.
 *
 *   npm run reta:seed -- ~/Desktop/vanguard-reta-coa.png
 *   # or without a CoA file (product + lot only):
 *   npm run reta:seed
 *
 * IDEMPOTENT: reuses the product/lot if they already exist (updates the lot's
 * display fields). The CoA file, if passed, is uploaded fresh and re-pointed.
 *
 * Prereqs: the base catalog must already be seeded (sales channel, shipping
 * profile, stock location, region) — i.e. `npm run seed` has run at least once.
 *
 * ⚠️ PLACEHOLDERS to review in Admin before this is truly public:
 *   - Variant PRICES below are illustrative (mirrored from a competitor) — set
 *     your real pricing.
 *   - CAS number is from public sources; molecular formula / weights are left
 *     blank deliberately (don't ship fabricated specs) — fill them in Admin.
 *   - The lot data is transcribed from the Vanguard CoA (Lot 1234, 99.54%).
 */

const HANDLE = "retatrutide"
const LOT_NUMBER = "1234"

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

export default async function seedRetatrutide({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

  const [rawCoaPath] = args ?? []

  // ── Resolve the existing catalog scaffolding (must already be seeded) ──────
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

  // ── Create the Retatrutide product (idempotent by handle) ──────────────────
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: HANDLE },
  })
  let product = existing?.[0]

  if (!product) {
    logger.info("Creating Retatrutide product…")
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Retatrutide",
            subtitle: "GIP / GLP-1 / Glucagon Triple Agonist",
            handle: HANDLE,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            description:
              "Retatrutide is a synthetic 39-residue polypeptide studied as a triple agonist of the GIP, GLP-1, and glucagon receptors. Each production lot is analytically verified by HPLC to confirm molecular identity and purity, and is supplied strictly for laboratory research use.",
            sales_channels: [{ id: salesChannel.id }],
            // Label specs (NOT per-lot guarantees). Molecular formula/weights are
            // intentionally omitted — fill in Admin rather than ship guesses.
            metadata: {
              cas_number: "2381089-83-2",
              purity_spec: ">=99%",
              method: "HPLC-UV/VIS",
              made_in: "USA",
              format: "Lyophilized Powder",
              research_use_only: true,
            },
            options: [
              { title: "Size", values: ["12 mg", "20 mg", "30 mg", "60 mg"] },
            ],
            variants: [
              {
                title: "12 mg",
                sku: "RETA-12MG",
                options: { Size: "12 mg" },
                manage_inventory: true,
                prices: [{ amount: 105, currency_code: "usd" }], // placeholder $
              },
              {
                title: "20 mg",
                sku: "RETA-20MG",
                options: { Size: "20 mg" },
                manage_inventory: true,
                prices: [{ amount: 200, currency_code: "usd" }], // placeholder $
              },
              {
                title: "30 mg",
                sku: "RETA-30MG",
                options: { Size: "30 mg" },
                manage_inventory: true,
                prices: [{ amount: 240, currency_code: "usd" }], // placeholder $
              },
              {
                title: "60 mg",
                sku: "RETA-60MG",
                options: { Size: "60 mg" },
                manage_inventory: true,
                prices: [{ amount: 400, currency_code: "usd" }], // placeholder $
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

  // ── Inventory levels for any new variants at the warehouse ─────────────────
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku", "location_levels.location_id"],
  })
  const newLevels: CreateInventoryLevelInput[] = (inventoryItems ?? [])
    .filter(
      (item: any) =>
        item.sku?.startsWith("RETA-") &&
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
    logger.info(`Created ${newLevels.length} inventory level(s) for Retatrutide.`)
  }

  // ── The current lot, from the Vanguard CoA (verbatim display fields) ───────
  const lotService: any = container.resolve(LOT_COA_MODULE)
  const lotData = {
    product_id: product.id,
    variant_id: product.variants?.[0]?.id ?? null,
    lot_number: LOT_NUMBER,
    purity_pct: 99, // int column; the card shows purity_text verbatim
    purity_text: "99.54%",
    strength: "300 mg",
    lab_name: "Vanguard Laboratory",
    test_method: "HPLC-UV/VIS",
    measured_mass: 117.4,
    released_at: new Date("2025-10-14"),
  }
  const [existingLot] = await lotService.listLots({ lot_number: LOT_NUMBER })
  let lot
  if (existingLot) {
    lot = (await lotService.updateLots({ id: existingLot.id, ...lotData }))
    lot = Array.isArray(lot) ? lot[0] : lot
    logger.info(`Updated lot ${LOT_NUMBER} display fields.`)
  } else {
    lot = await lotService.createLots(lotData)
    lot = Array.isArray(lot) ? lot[0] : lot
    logger.info(`Created lot ${LOT_NUMBER}.`)
  }

  // ── Optional: upload + attach the CoA file ─────────────────────────────────
  if (rawCoaPath) {
    const filePath = path.resolve(
      rawCoaPath.startsWith("~")
        ? path.join(process.env.HOME ?? "", rawCoaPath.slice(1))
        : rawCoaPath
    )
    if (!fs.existsSync(filePath)) {
      throw new Error(`CoA file not found: ${filePath}`)
    }
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_BY_EXT[ext]
    if (!mimeType) {
      throw new Error(
        `Unsupported CoA type "${ext}". Allowed: ${Object.keys(MIME_BY_EXT).join(", ")}`
      )
    }
    const content = fs.readFileSync(filePath).toString("base64")
    const fileModule: any = container.resolve(Modules.FILE)
    logger.info(`Uploading CoA "${LOT_NUMBER}${ext}" (${mimeType})…`)
    const uploaded = await fileModule.createFiles({
      filename: `${LOT_NUMBER}${ext}`,
      mimeType,
      content,
      access: "private", // served only via short-lived signed URLs
    })
    await lotService.updateLots({ id: lot.id, coa_file_id: uploaded.id })
    logger.info(`✅ CoA attached (file_id ${uploaded.id}).`)
  } else {
    logger.info(
      "No CoA file passed — product + lot ready; re-run with a file path to attach the certificate."
    )
  }

  logger.info(
    `Done. Visit the PDP at /us/products/${HANDLE} — the CoA hero should populate.`
  )
}
