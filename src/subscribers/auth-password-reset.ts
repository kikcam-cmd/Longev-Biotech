import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { buildPasswordResetEmail } from "../lib/email-templates"

/**
 * Sends the "reset your password" email when a customer requests a reset.
 *
 * Fires on `auth.password_reset`, emitted by Medusa's generate-reset-password-token
 * workflow (POST /auth/customer/emailpass/reset-password). Event payload:
 *   { entity_id, actor_type, token, metadata }
 * - `entity_id` is the identifier — for emailpass that's the customer's email.
 * - `token` is a 15-minute JWT; the storefront posts it to updateProvider to set the
 *   new password. It is consumed on submit (POST), NOT on page load, so an email
 *   scanner that pre-fetches the link (see corp-mail prefetch note) just renders the
 *   form — it doesn't burn the token.
 *
 * Guard: this event also fires for ADMIN resets (actor_type === "user"), which go
 * through the Medusa dashboard's own reset page — we must not send them this branded
 * customer email pointing at the storefront. Only handle `customer`.
 *
 * Best-effort: a Resend failure is logged, never re-thrown. Note the request route
 * runs the workflow with throwOnError:false and always returns 201, so the storefront
 * can't (and shouldn't) reveal whether the email belongs to a real account — the email
 * itself only goes out when the identity exists.
 */
export default async function authPasswordResetHandler({
  event,
  container,
}: SubscriberArgs<{
  entity_id: string
  actor_type: string
  token: string
  metadata?: Record<string, unknown>
}>) {
  const logger = container.resolve("logger")
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  const { entity_id: email, actor_type, token, metadata } = event.data

  if (actor_type !== "customer") {
    // Admin (or other actor) reset — not our storefront flow.
    return
  }
  if (!email || !token) {
    logger.warn(`[auth.password_reset] missing email/token — skipping`)
    return
  }

  const storeUrl = process.env.STOREFRONT_URL || "https://www.longevbiotech.com"

  // Country code is just a path segment within our own trusted STOREFRONT_URL, so it
  // can't be turned into an open redirect — but validate the shape anyway and default
  // to the primary US region.
  const rawCc = (metadata?.countryCode as string | undefined)?.toLowerCase()
  const cc = rawCc && /^[a-z]{2}$/.test(rawCc) ? rawCc : "us"

  const base = storeUrl.replace(/\/$/, "")
  const resetUrl = `${base}/${cc}/reset-password?token=${encodeURIComponent(
    token
  )}&email=${encodeURIComponent(email)}`

  const { subject, html, text } = buildPasswordResetEmail({ resetUrl, storeUrl })

  try {
    await notificationModule.createNotifications({
      to: email,
      channel: "email",
      template: "password-reset",
      content: { subject, html, text },
    })
    logger.info(`[auth.password_reset] reset email queued → ${email}`)
  } catch (e: any) {
    logger.error(
      `[auth.password_reset] reset email failed → ${email}: ${e?.message ?? e}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
