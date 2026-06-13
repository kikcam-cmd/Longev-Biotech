import { defineMiddlewares, authenticate } from "@medusajs/framework/http"

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
  ],
})
