import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import {
  buildOrderConfirmationEmail,
  buildOpsAlertEmail,
  type OrderLine,
} from "../lib/email-templates"

/**
 * Fires when an order is placed. Sends:
 *  - buyer order-confirmation email
 *  - (optional) internal new-order ops ping, if OPS_NOTIFICATION_EMAIL is set
 *
 * Both are best-effort (each wrapped in its own try/catch) — a mail failure must never
 * roll back a placed order. If RESEND_API_KEY is unset, no provider handles the email
 * channel and createNotifications throws "no notification provider for channel: email";
 * the try/catch swallows it, so the order still completes (just no email).
 */
export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const orderModule = container.resolve(Modules.ORDER)
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  const order = await orderModule.retrieveOrder(event.data.id, {
    relations: ["items", "shipping_address"],
  })

  logger.info(
    `[order.placed] ${order.display_id} — ${order.email} — ${order.items?.length ?? 0} item(s)`
  )

  const items: OrderLine[] = (order.items ?? []).map((it: any) => ({
    title: it.product_title ? `${it.product_title} — ${it.title}` : it.title,
    quantity: num(it.quantity),
    unitPrice: num(it.unit_price),
  }))

  const storeUrl = process.env.STOREFRONT_URL || "https://www.longevbiotech.com"
  const currencyCode = order.currency_code || "usd"
  const total = num(order.total)

  // --- Buyer confirmation ---
  if (order.email) {
    try {
      const { subject, html, text } = buildOrderConfirmationEmail({
        displayId: order.display_id,
        firstName: order.shipping_address?.first_name,
        currencyCode,
        total,
        items,
        storeUrl,
      })
      await notificationModule.createNotifications({
        to: order.email,
        channel: "email",
        template: "order-confirmation",
        content: { subject, html, text },
      })
      logger.info(`[order.placed] confirmation email queued → ${order.email}`)
    } catch (e: any) {
      logger.error(
        `[order.placed] confirmation email failed → ${order.email}: ${e?.message ?? e}`
      )
    }
  }

  // --- Internal ops alert (opt-in) ---
  const opsTo = process.env.OPS_NOTIFICATION_EMAIL
  if (opsTo) {
    try {
      const { subject, html, text } = buildOpsAlertEmail({
        displayId: order.display_id,
        email: order.email ?? "(no email)",
        currencyCode,
        total,
        items,
        storeUrl,
      })
      await notificationModule.createNotifications({
        to: opsTo,
        channel: "email",
        template: "order-ops-alert",
        content: { subject, html, text },
      })
    } catch (e: any) {
      logger.error(`[order.placed] ops alert failed → ${opsTo}: ${e?.message ?? e}`)
    }
  }
}

/**
 * Coerce a Medusa amount to a plain number. v2 computed totals (order.total, unit_price)
 * often come back as BigNumber objects, where `Number(obj)` → NaN. Handle plain numbers,
 * numeric strings, and the BigNumber shapes (`.numeric` getter / `.value`).
 */
function num(v: any): number {
  if (v == null) return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  if (typeof v === "object") {
    const candidate =
      typeof v.numeric === "number" ? v.numeric : Number(v.value ?? v.valueOf?.())
    return Number.isFinite(candidate) ? candidate : 0
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
