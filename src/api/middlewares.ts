import {
  defineMiddlewares,
  authenticate,
  type MedusaRequest,
  type MedusaResponse,
  type MedusaNextFunction,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

/**
 * RUO gate enforcement: block Medusa's default complete-cart endpoint so EVERY
 * order is placed through `POST /store/carts/:id/ruo-complete`, which records the
 * three Research-Use-Only affirmations (immutable attestation) before
 * `completeCartWorkflow` runs and also performs referral attribution.
 *
 * Without this, the attestation is bypassable: a direct API caller — or, once a
 * real payment provider is wired, the storefront's default `placeOrder`
 * payment-button path (`StripePaymentButton`) — could complete a cart via the
 * core `POST /store/carts/:id/complete` and skip the attestation entirely.
 *
 * Safe to block: `ruo-complete` invokes `completeCartWorkflow(req.scope).run()`
 * DIRECTLY (not via this HTTP route), so the gated path is unaffected. When the
 * real processor lands, its completion must also go through `ruo-complete`.
 */
function blockDefaultCartComplete(
  _req: MedusaRequest,
  _res: MedusaResponse,
  _next: MedusaNextFunction
) {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "Direct cart completion is disabled. Place orders via POST /store/carts/:id/ruo-complete, which records the required Research-Use-Only attestation."
  )
}

/**
 * Require a signed-in customer for the affiliate endpoints. Medusa does not
 * authenticate custom /store routes by default; this populates
 * `req.auth_context.actor_id` with the customer id (or 401s) so the affiliate
 * routes can trust the caller's identity.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/affiliate",
      method: ["GET", "POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/carts/:id/complete",
      method: ["POST"],
      middlewares: [blockDefaultCartComplete],
    },
  ],
})
