import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * One-off: correct prices that were seeded in cents (Medusa v1 thinking) to
 * Medusa v2 major units. $99 was stored as 9900 (→ "$9,900"). This rewrites the
 * existing variant + shipping prices to the correct decimal amounts.
 *
 *   npm run exec ./src/scripts/fix-prices.ts
 *
 * Safe to delete after running once.
 */
export default async function fixPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const priceByHandle: Record<string, number> = {
    "bpc-157": 99,
    "glp-1": 189,
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: Object.keys(priceByHandle) },
  })

  for (const p of products) {
    const amount = priceByHandle[p.handle]
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: p.id,
            variants: (p.variants ?? []).map((v: any) => ({
              id: v.id,
              prices: [{ amount, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    logger.info(`Set ${p.handle} → $${amount}`)
  }

  const shipByName: Record<string, number> = {
    "Standard Shipping": 10,
    "Express Shipping": 25,
  }
  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  for (const so of shippingOptions) {
    const amount = shipByName[so.name]
    if (!amount) continue
    await updateShippingOptionsWorkflow(container).run({
      input: [{ id: so.id, prices: [{ currency_code: "usd", amount }] }],
    })
    logger.info(`Set shipping "${so.name}" → $${amount}`)
  }

  logger.info("Price fix complete.")
}
