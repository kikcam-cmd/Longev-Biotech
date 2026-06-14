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
    // Display fields for the per-lot CoA hero. Stored verbatim as text so the card
    // renders exactly what the lab certificate states — no numeric coercion or
    // precision loss (e.g. "99.54%", "≤0.05 EU/mL"). `purity_pct` (integer) is kept
    // for any numeric use; `purity_text` is what the card actually shows.
    purity_text: model.text().nullable(),
    strength: model.text().nullable(),
    lab_name: model.text().nullable(),
    test_method: model.text().nullable(),
    endotoxin: model.text().nullable(),
  })
  .indexes([
    { on: ["product_id", "lot_number"], unique: true },
  ])

export default Lot
