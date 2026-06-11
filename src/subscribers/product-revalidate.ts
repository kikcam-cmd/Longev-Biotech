import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

/**
 * Pings the storefront's /api/revalidate route whenever a product or variant
 * changes, so the catalog / PDP / homepage reflect admin edits (new product,
 * thumbnail, price, variant image…) without a manual Vercel Data Cache purge.
 *
 * Best-effort: a failed ping is logged but never blocks the admin action. If the
 * env vars below aren't set (e.g. local dev), it's a silent no-op.
 *
 * Requires on Medusa Cloud:
 *   STOREFRONT_REVALIDATE_URL  e.g. https://www.longevbiotech.com/api/revalidate
 *   REVALIDATE_SECRET          must match the storefront's REVALIDATE_SECRET
 */
export default async function productRevalidateHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const url = process.env.STOREFRONT_REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET

  if (!url || !secret) {
    return // not configured — no-op
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tag: "products" }),
    })

    if (!res.ok) {
      logger.warn(
        `[product-revalidate] storefront returned ${res.status} for ${event.name}`
      )
    } else {
      logger.info(`[product-revalidate] revalidated storefront on ${event.name}`)
    }
  } catch (e: any) {
    logger.warn(
      `[product-revalidate] failed to ping storefront: ${e?.message ?? e}`
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-variant.updated",
  ],
}
