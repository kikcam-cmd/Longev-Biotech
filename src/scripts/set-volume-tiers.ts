import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  TIERS,
  tierPrice,
  EXCLUDE_HANDLES,
  applyVolumeTiersToVariant,
} from "../lib/volume-tiers"

// Re-export so existing importers (add-size route) keep resolving from here.
export { TIERS, tierPrice }

/**
 * Slice 3c — per-vial volume discount tiers (bulk pass).
 *
 * Re-derives the quantity-tiered prices on every peptide variant's price set from
 * its current base price. The cart honors them because Medusa builds each line
 * item's pricing context with its `quantity` and picks the price whose
 * [min_quantity, max_quantity] range contains it.
 *
 *   npm run volume:tiers
 *
 * Tiers + the apply logic now live in `src/lib/volume-tiers.ts` (shared with the
 * add-size route + the variant-tiers-init subscriber). IDEMPOTENT. Skips
 * Bacteriostatic Water (an add-on, not tiered).
 */
export default async function setVolumeTiers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "variants.id", "variants.title"],
  })
  const variants = products
    .filter((p: any) => !EXCLUDE_HANDLES.has(p.handle))
    .flatMap((p: any) =>
      (p.variants ?? []).map((v: any) => ({ ...v, productTitle: p.title }))
    )
  if (!variants.length) {
    throw new Error("No tierable variants found — seed the catalog first.")
  }

  let updated = 0
  for (const v of variants) {
    const { tiered, base } = await applyVolumeTiersToVariant(container, v.id)
    if (!tiered) {
      logger.warn(`No base USD price for ${v.productTitle} ${v.title} — skipping.`)
      continue
    }
    updated++
    logger.info(
      `${v.productTitle} ${v.title}: base $${base} → ` +
        TIERS.map(
          (t) => `${t.minQty}${t.maxQty ? `-${t.maxQty}` : "+"}=$${tierPrice(base!, t.pct)}`
        ).join(" · ")
    )
  }

  logger.info(`Volume tiers applied to ${updated} variant(s).`)
}
