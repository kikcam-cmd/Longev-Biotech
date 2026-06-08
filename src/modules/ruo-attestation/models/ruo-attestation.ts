import { model } from "@medusajs/framework/utils"

/**
 * Immutable audit record of the Research-Use-Only affirmation captured at checkout.
 * One row per completed cart/order. Mirrors the original Supabase `ruo_attestations`
 * table. Do not update rows except to backfill `order_id` once the order exists.
 */
const RuoAttestation = model.define("ruo_attestation", {
  id: model.id().primaryKey(),
  order_id: model.text().nullable(),
  cart_id: model.text().nullable(),
  customer_id: model.text().nullable(),
  email: model.text(),
  affirmed_research_use: model.boolean(),
  affirmed_qualified: model.boolean(),
  affirmed_not_human: model.boolean(),
  attestation_text: model.text(),
  ip_address: model.text().nullable(),
  user_agent: model.text().nullable(),
})

export default RuoAttestation
