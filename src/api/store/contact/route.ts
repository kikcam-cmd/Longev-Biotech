import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { buildContactEmail } from "../../../lib/email-templates"

type ContactBody = {
  name?: string
  email?: string
  subject?: string
  message?: string
  /** Honeypot — real users never see/fill this; bots do. */
  company?: string
}

// Field caps: keep the payload small and the email readable. Anything over is a
// bot or an abuse attempt, not a real inquiry.
const MAX = { name: 120, email: 200, subject: 200, message: 5000 }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Public contact-form endpoint. Sends the visitor's message to the support inbox
 * via the Notification module (Resend), with reply-to set to the visitor so
 * support can answer them directly.
 *
 * This is the project's first PUBLIC, unauthenticated, email-triggering route, so
 * it defends itself: honeypot, per-field length caps, and email-format validation.
 * NOTE: there is no rate-limiting yet (would need a shared Redis store) — DEFERRED.
 * If this endpoint sees abuse, add a per-IP limiter before it sends.
 *
 * Unlike the email subscribers (which swallow failures because their primary job
 * is the order/registration, not the email), THIS route's only job is to send —
 * so a send failure returns a non-2xx and the storefront surfaces it.
 */
export async function POST(req: MedusaRequest<ContactBody>, res: MedusaResponse) {
  const body = (req.body ?? {}) as ContactBody

  // Honeypot: pretend success without sending so bots get no signal.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return res.status(200).json({ ok: true })
  }

  const name = (body.name ?? "").trim()
  const email = (body.email ?? "").trim()
  const subject = (body.subject ?? "").trim() || "Website inquiry"
  const message = (body.message ?? "").trim()

  if (!name || !email || !message) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Name, email, and message are required."
    )
  }
  if (!EMAIL_RE.test(email)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A valid email is required.")
  }
  if (
    name.length > MAX.name ||
    email.length > MAX.email ||
    subject.length > MAX.subject ||
    message.length > MAX.message
  ) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "One or more fields are too long.")
  }

  const to =
    process.env.CONTACT_NOTIFICATION_EMAIL ||
    process.env.RESEND_REPLY_TO ||
    "support@longevbiotech.com"
  const storeUrl = process.env.STOREFRONT_URL || "https://www.longevbiotech.com"

  const { subject: emailSubject, html, text } = buildContactEmail({
    name,
    email,
    subject,
    message,
    storeUrl,
  })

  const notificationModule = req.scope.resolve(Modules.NOTIFICATION)

  // Let a send failure throw → Medusa returns 500 → the form shows an error.
  await notificationModule.createNotifications({
    to,
    channel: "email",
    template: "contact-inquiry",
    content: { subject: emailSubject, html, text },
    // Replies go to the visitor, not the default support@ self-loop.
    provider_data: { reply_to: email },
  })

  return res.status(200).json({ ok: true })
}
