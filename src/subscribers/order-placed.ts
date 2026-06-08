import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * Fires when an order is placed. Hook point for ops notifications:
 *  - transactional email to the buyer (order confirmation)
 *  - new-order ping to Slack / ops inbox
 * Wired fully in the "fulfillment, email, analytics" stage.
 */
export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const orderModule = container.resolve(Modules.ORDER)

  const order = await orderModule.retrieveOrder(event.data.id, {
    relations: ["items"],
  })

  logger.info(
    `[order.placed] ${order.display_id} — ${order.email} — ${order.items?.length ?? 0} item(s)`
  )

  // TODO (email stage): container.resolve(Modules.NOTIFICATION).createNotifications({...})
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
