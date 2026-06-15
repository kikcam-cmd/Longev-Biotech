import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Per-vial volume discount tiers — the single backend source of truth, shared by
 * the `volume:tiers` script, the `add-size` route, and the variant-tiers-init
 * subscriber. MUST stay in lockstep with the storefront `lib/util/volume-tiers.ts`
 * (same percentages + min quantities + round2) so displayed == enforced.
 *
 *   2–3 vials → 5% off · 4–5 → 10% off · 6+ → 15% off
 */
export const TIERS = [
  { minQty: 2, maxQty: 3, pct: 5 },
  { minQty: 4, maxQty: 5, pct: 10 },
  { minQty: 6, maxQty: null as number | null, pct: 15 },
]

/** Products that should NOT get volume tiers (add-ons, not vials). */
export const EXCLUDE_HANDLES = new Set(["bacteriostatic-water"])

const CURRENCY = "usd"

/** Round to money precision (2 decimals); avoids 0.1*99 float artifacts. */
export const round2 = (n: number) => Math.round(n * 100) / 100

/** Tier price for a base amount — the ONE formula both repos share. */
export const tierPrice = (base: number, pct: number) => round2(base * (1 - pct / 100))

/**
 * Apply the volume tiers to a single variant's price set, idempotently (removes
 * any existing tiered prices first, then re-derives from the current base USD
 * price). No-op (returns tiered:false) if the variant has no base USD price yet.
 */
export async function applyVolumeTiersToVariant(
  container: any,
  variantId: string
): Promise<{ tiered: boolean; base?: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)

  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variantId },
  })
  const priceSetId = links?.[0]?.price_set_id
  if (!priceSetId) return { tiered: false }

  const prices = await pricing.listPrices({ price_set_id: [priceSetId] })
  const usd = prices.filter((p: any) => p.currency_code === CURRENCY)
  const base = usd.find((p: any) => p.min_quantity == null)
  if (!base) return { tiered: false }
  const baseAmount = Number(base.amount)

  const staleTierIds = usd.filter((p: any) => p.min_quantity != null).map((p: any) => p.id)
  if (staleTierIds.length) await pricing.removePrices(staleTierIds)

  await pricing.addPrices({
    priceSetId,
    prices: TIERS.map((t) => ({
      currency_code: CURRENCY,
      amount: tierPrice(baseAmount, t.pct),
      min_quantity: t.minQty,
      ...(t.maxQty != null ? { max_quantity: t.maxQty } : {}),
    })),
  })
  return { tiered: true, base: baseAmount }
}
