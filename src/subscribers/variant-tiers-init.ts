import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { EXCLUDE_HANDLES, applyVolumeTiersToVariant } from "../lib/volume-tiers"

/**
 * Safety net: apply the per-vial volume tiers to every newly-created variant —
 * including ones made via the stock Admin "Create" button (which sets only the
 * base price, no tiers). Without this a natively-created size is in-stock (via
 * variant-stock-init) but has no quantity discounts until `npm run volume:tiers`.
 *
 * Idempotent (the helper removes existing tier prices before re-adding), so it's
 * harmless when the add-size route already applied tiers to the same variant.
 * Skips Bacteriostatic Water (an add-on, not tiered) — same EXCLUDE_HANDLES as
 * the bulk script. No-op if the variant has no base USD price yet.
 */
export default async function variantTiersInit({
  event,
  container,
}: SubscriberArgs<{ id?: string; ids?: string[] }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const data: any = event.data
  const variantIds: string[] = Array.isArray(data)
    ? data.map((d: any) => d?.id).filter(Boolean)
    : data?.ids ?? (data?.id ? [data.id] : [])
  if (!variantIds.length) return

  for (const variantId of variantIds) {
    try {
      const { data: vs } = await query.graph({
        entity: "product_variant",
        fields: ["id", "title", "product.handle"],
        filters: { id: variantId },
      })
      const variant: any = vs?.[0]
      const handle = variant?.product?.handle
      if (handle && EXCLUDE_HANDLES.has(handle)) continue

      const { tiered, base } = await applyVolumeTiersToVariant(container, variantId)
      if (tiered) {
        logger.info(`[variant-tiers-init] tiered variant ${variantId} (base $${base})`)
      }
    } catch (e: any) {
      logger.warn(`[variant-tiers-init] ${variantId}: ${e?.message ?? e}`)
    }
  }
}

export const config: SubscriberConfig = {
  event: "product-variant.created",
}
