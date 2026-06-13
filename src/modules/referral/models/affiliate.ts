import { model } from "@medusajs/framework/utils"

/**
 * An affiliate is a customer who has opted into the referral program and been
 * issued a shareable referral `code`. One row per affiliated customer.
 * Provisioned instantly (self-serve) when a signed-in customer opts in — there
 * is no approval step in this MVP, and no payouts are computed here.
 */
const Affiliate = model.define("affiliate", {
  id: model.id().primaryKey(),
  customer_id: model.text().unique(),
  code: model.text().unique(),
})

export default Affiliate
