import { model } from "@medusajs/framework/utils"

/**
 * Per-lot analytical results + Certificate of Analysis. Mirrors the original
 * Supabase `product_lots` table. The lot is the source of truth for the purity/mass
 * figures that apply to a shipment; the product-level spec is a label spec only.
 *
 * `coa_file_id` references a file stored in Medusa's File module (S3), served to
 * customers only via short-lived signed URLs minted by the /store CoA route.
 */
const Lot = model
  .define("lot", {
    id: model.id().primaryKey(),
    product_id: model.text(),
    variant_id: model.text().nullable(),
    lot_number: model.text(),
    purity_pct: model.number().nullable(),
    measured_mass: model.number().nullable(),
    coa_file_id: model.text().nullable(),
    released_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["product_id", "lot_number"], unique: true },
  ])

export default Lot
