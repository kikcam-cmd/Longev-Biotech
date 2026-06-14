import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Slice 3c — per-vial volume discount tiers.
 *
 * Adds quantity-tiered prices to every peptide variant's price set so buying
 * more vials of the SAME variant lowers the per-vial price. The cart honors
 * these because Medusa builds each line item's pricing context with its
 * `quantity` (core-flows get-variants-and-items-with-prices) and picks the
 * price whose [min_quantity, max_quantity] range contains it.
 *
 *   npm run volume:tiers
 *
 * Tiers (single source of truth — the storefront PDP table uses the SAME
 * percentages + min quantities so displayed == enforced):
 *   2–3 vials → 5% off · 4–5 → 10% off · 6+ → 15% off
 *
 * Money math: amount = round2(base * (1 - pct/100)). The storefront PDP table
 * uses the identical round2 formula so displayed per-vial == enforced exactly.
 *
 * IDEMPOTENT: removes any existing tiered prices (min_quantity set) before
 * re-adding, so re-running re-derives tiers from the current base price.
 * Skips Bacteriostatic Water (an add-on, not tiered).
 */

// Keep in lockstep with the storefront VOLUME_TIERS (volume-tiers.ts).
export const TIERS = [
  { minQty: 2, maxQty: 3, pct: 5 },
  { minQty: 4, maxQty: 5, pct: 10 },
  { minQty: 6, maxQty: null as number | null, pct: 15 },
]

const EXCLUDE_HANDLES = new Set(["bacteriostatic-water"])
const CURRENCY = "usd"

/** Round to money precision (2 decimals); avoids 0.1*99 float artifacts. */
const round2 = (n: number) => Math.round(n * 100) / 100
/** Tier price for a base amount — the ONE formula both repos share. */
export const tierPrice = (base: number, pct: number) =>
  round2(base * (1 - pct / 100))

export default async function setVolumeTiers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "variants.id", "variants.title"],
  })
  const variants = products
    .filter((p: any) => !EXCLUDE_HANDLES.has(p.handle))
    .flatMap((p: any) =>
      (p.variants ?? []).map((v: any) => ({
        ...v,
        productTitle: p.title,
        handle: p.handle,
      }))
    )
  if (!variants.length) {
    throw new Error("No tierable variants found — seed the catalog first.")
  }

  // variant_id → price_set_id
  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
  })
  const priceSetByVariant = new Map<string, string>(
    links.map((l: any) => [l.variant_id, l.price_set_id])
  )

  let updated = 0
  for (const v of variants) {
    const priceSetId = priceSetByVariant.get(v.id)
    if (!priceSetId) {
      logger.warn(`No price set for ${v.productTitle} ${v.title} — skipping.`)
      continue
    }

    const prices = await pricing.listPrices({ price_set_id: [priceSetId] })
    const usd = prices.filter((p: any) => p.currency_code === CURRENCY)
    const base = usd.find((p: any) => p.min_quantity == null)
    if (!base) {
      logger.warn(`No base USD price for ${v.productTitle} ${v.title} — skipping.`)
      continue
    }
    const baseAmount = Number(base.amount)

    // Remove existing tier prices (min_quantity set) → idempotent.
    const staleTierIds = usd
      .filter((p: any) => p.min_quantity != null)
      .map((p: any) => p.id)
    if (staleTierIds.length) {
      await pricing.removePrices(staleTierIds)
    }

    await pricing.addPrices({
      priceSetId,
      prices: TIERS.map((t) => ({
        currency_code: CURRENCY,
        amount: tierPrice(baseAmount, t.pct),
        min_quantity: t.minQty,
        ...(t.maxQty != null ? { max_quantity: t.maxQty } : {}),
      })),
    })
    updated++
    logger.info(
      `${v.productTitle} ${v.title}: base $${baseAmount} → ` +
        TIERS.map(
          (t) =>
            `${t.minQty}${t.maxQty ? `-${t.maxQty}` : "+"}=$${tierPrice(baseAmount, t.pct)}`
        ).join(" · ")
    )
  }

  logger.info(`Volume tiers applied to ${updated} variant(s).`)
}
