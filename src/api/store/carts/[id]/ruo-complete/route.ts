import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { RUO_ATTESTATION_MODULE } from "../../../../../modules/ruo-attestation"
import { ATTESTATION_TEXT } from "../../../../../modules/ruo-attestation/constants"
import { REFERRAL_MODULE } from "../../../../../modules/referral"

type RuoCompleteBody = {
  affirmed_research_use?: boolean
  affirmed_qualified?: boolean
  affirmed_not_human?: boolean
  email?: string
  referral_code?: string
}

/**
 * Attribute a placed order to a referral code, if one was carried through from
 * the storefront cookie. Writes a queryable ReferralOrder row (the source of
 * truth for the affiliate dashboard) and stamps order.metadata for admin
 * visibility. Best-effort: any failure here must NOT fail an already-placed
 * order, so the whole thing is guarded and swallowed.
 */
async function attributeReferral(
  req: MedusaRequest,
  order: any,
  referralCode?: string
): Promise<void> {
  const code = (referralCode || "").trim()
  if (!code) return

  try {
    const referral: any = req.scope.resolve(REFERRAL_MODULE)
    const [affiliate] = await referral.listAffiliates({ code })
    // Unknown code, or self-referral (the buyer is the affiliate) → skip.
    if (!affiliate || affiliate.customer_id === order.customer_id) return

    await referral.createReferralOrders({
      code: affiliate.code,
      affiliate_customer_id: affiliate.customer_id,
      order_id: order.id,
      order_total: Number(order.total) || 0,
    })

    try {
      const orderModule = req.scope.resolve(Modules.ORDER)
      await orderModule.updateOrders(order.id, {
        metadata: { ...(order.metadata ?? {}), referral_code: affiliate.code },
      })
    } catch {
      // metadata stamp is non-essential (admin convenience only)
    }
  } catch (e) {
    console.error("[referral] attribution failed (order still placed):", e)
  }
}

/**
 * POST /store/carts/:id/ruo-complete
 *
 * The storefront calls THIS instead of the default cart-complete endpoint. It is
 * the server-side RUO gate: an order cannot be created unless all three
 * affirmations are present. The exact attestation wording is recorded immutably
 * before the order is placed, then linked to the resulting order.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const body = (req.body ?? {}) as RuoCompleteBody

  if (
    body.affirmed_research_use !== true ||
    body.affirmed_qualified !== true ||
    body.affirmed_not_human !== true
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Research-Use-Only attestation is required to place an order."
    )
  }

  const cartModule = req.scope.resolve(Modules.CART)
  const cart = await cartModule.retrieveCart(cartId)
  const email = body.email || cart.email || ""

  const ruo: any = req.scope.resolve(RUO_ATTESTATION_MODULE)
  const xff = (req.headers["x-forwarded-for"] as string) || ""

  const attestation = await ruo.createRuoAttestations({
    cart_id: cartId,
    email,
    affirmed_research_use: true,
    affirmed_qualified: true,
    affirmed_not_human: true,
    attestation_text: ATTESTATION_TEXT,
    ip_address: xff.split(",")[0].trim() || null,
    user_agent: (req.headers["user-agent"] as string) || null,
  })

  // Place the order via Medusa's core workflow (handles payment auth, inventory, etc.)
  const { result } = await completeCartWorkflow(req.scope).run({
    input: { id: cartId },
  })

  // Backfill the order id onto the immutable attestation record.
  await ruo.updateRuoAttestations({ id: attestation.id, order_id: (result as any).id })

  // Attribute the order to a referral code if one rode along (best-effort).
  await attributeReferral(req, result, body.referral_code)

  return res.status(200).json({ type: "order", order: result })
}
