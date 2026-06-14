import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
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
 *
 * NOTE: the order is read via the Query graph with FULL items (`items.*`), NOT
 * `orderModule.retrieveOrder(id, { relations: ["items"] })`. Medusa only computes the
 * order-level totals (`total`, `item_total`) when the full items relation is loaded —
 * a partial item selection (or the module-service relations form) leaves `total` at the
 * shipping amount only (it rendered as $0.00 in the first send-test). The store route and
 * the referral attribution use this same graph path.
 */
export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "item_total",
      "shipping_total",
      "items.*",
      "shipping_address.first_name",
    ],
    filters: { id: event.data.id },
  })
  const order: any = data?.[0]
  if (!order) {
    logger.warn(`[order.placed] order ${event.data.id} not found — skipping emails`)
    return
  }

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
  // Prefer the computed grand total; fall back to item + shipping totals defensively.
  const total = num(order.total) || num(order.item_total) + num(order.shipping_total)

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
