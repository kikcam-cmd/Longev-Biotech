import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { buildWelcomeEmail } from "../lib/email-templates"

/**
 * Sends the welcome email when a customer registers (S3 of the accounts workstream).
 *
 * Guard: `customer.created` also fires for GUEST customers created at checkout. We only
 * welcome real registrations (`has_account === true`) so checkout buyers don't get a
 * "welcome, your account is ready" email they never asked for.
 *
 * Best-effort: a Resend failure is logged, never re-thrown — registration must succeed
 * even if email is down or unconfigured. If RESEND_API_KEY is unset, no provider handles
 * the email channel and createNotifications throws "no notification provider for channel:
 * email" — the try/catch below swallows it, so registration still succeeds.
 */
export default async function customerCreatedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const customerModule = container.resolve(Modules.CUSTOMER)
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  const customer = await customerModule.retrieveCustomer(event.data.id)

  if (!customer?.email) {
    logger.warn(`[customer.created] ${event.data.id} has no email — skipping welcome`)
    return
  }
  if (!customer.has_account) {
    // Guest customer (created at checkout) — not a real registration.
    return
  }

  const { subject, html, text } = buildWelcomeEmail({
    firstName: customer.first_name,
    storeUrl: process.env.STOREFRONT_URL || "https://www.longevbiotech.com",
  })

  try {
    await notificationModule.createNotifications({
      to: customer.email,
      channel: "email",
      template: "customer-welcome",
      content: { subject, html, text },
    })
    logger.info(`[customer.created] welcome email queued → ${customer.email}`)
  } catch (e: any) {
    logger.error(
      `[customer.created] welcome email failed → ${customer.email}: ${e?.message ?? e}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "customer.created",
}
