import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Slice 3a — free shipping over a threshold.
 *
 * Adds a conditional $0 price (applies when the cart's item_total >= THRESHOLD)
 * alongside the existing flat base price on the Standard Shipping option. The
 * storefront's <FreeShippingPriceNudge> (already wired in layout.tsx) reads this
 * exact rule shape to render the progress bar; at/above the threshold Medusa
 * resolves the $0 price so checkout shipping is actually free.
 *
 * Medusa v2 price-rule shape (per updateShippingOptionsWorkflow input type):
 * a prices entry with rules as a PriceRule[] —
 *   { currency_code, amount, rules: [{ attribute, operator, value }] }
 * (the module-level docs show the object-map form; the workflow wants the array)
 *
 * Idempotent: re-running just re-sets Standard's price list to [base, free].
 *
 *   npm run shipping:free
 */
const THRESHOLD = 200 // USD major units (Medusa v2: 200 = $200, not cents)
const BASE = 10
const CURRENCY = "usd"
const OPTION_NAME = "Standard Shipping"

export default async function setFreeShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: opts } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  const standard = opts.find((o: any) => o.name === OPTION_NAME)
  if (!standard) {
    throw new Error(`Shipping option "${OPTION_NAME}" not found — run seed first.`)
  }

  await updateShippingOptionsWorkflow(container).run({
    input: [
      {
        id: standard.id,
        price_type: "flat",
        prices: [
          { currency_code: CURRENCY, amount: BASE },
          {
            currency_code: CURRENCY,
            amount: 0,
            rules: [
              { attribute: "item_total", operator: "gte", value: THRESHOLD },
            ],
          },
        ],
      },
    ],
  })

  logger.info(
    `"${OPTION_NAME}" → $${BASE} base, FREE when item_total >= $${THRESHOLD}.`
  )

  // Echo back the resulting price rules so the run self-verifies.
  const { data: after } = await query.graph({
    entity: "shipping_option",
    fields: [
      "name",
      "prices.amount",
      "prices.currency_code",
      "prices.price_rules.attribute",
      "prices.price_rules.operator",
      "prices.price_rules.value",
    ],
    filters: { id: standard.id },
  })
  logger.info(JSON.stringify(after, null, 2))
}
