import { model } from "@medusajs/framework/utils"

/**
 * One row per order attributed to a referral code, written right after the order
 * is placed (in the ruo-complete route). This is the queryable source of truth for
 * the affiliate dashboard — we do NOT rely on filtering order.metadata JSONB, which
 * Medusa v2 does not reliably support. `order_total` is stored in major units
 * (matching Medusa v2 pricing: 109 = $109) for an at-a-glance referred-revenue tally.
 * No commission/payout is computed — payouts are out of scope for this MVP.
 */
const ReferralOrder = model.define("referral_order", {
  id: model.id().primaryKey(),
  code: model.text(),
  affiliate_customer_id: model.text(),
  order_id: model.text().unique(),
  order_total: model.number().nullable(),
})

export default ReferralOrder
