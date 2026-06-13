/**
 * Email copy + HTML for Longev Biotech transactional mail.
 *
 * These builders return `{ subject, html, text }` which subscribers pass straight to
 * the Notification module's `content` field; the Resend provider forwards it verbatim.
 * Keeping the copy here (not in the provider) means there's no template registry to
 * maintain and the strings are trivially unit-testable.
 *
 * Email clients ignore <style> blocks and external CSS, so everything is inline-styled.
 * Palette mirrors the storefront's navy/RUO chrome.
 */

const NAVY = "#0a1f3c"
const INK = "#1a2433"
const MUTED = "#5b6b7f"
const LINE = "#e3e8ef"
const BG = "#f4f6f9"

const STORE_NAME = "Longev Biotech"

/** RUO disclaimer shown in every footer — core to this brand's compliance posture. */
const RUO_LINE =
  "For Research Use Only (RUO). Not for human or veterinary use, diagnostic, or therapeutic purposes."

type EmailParts = { subject: string; html: string; text: string }

function shell(opts: {
  preheader: string
  heading: string
  bodyHtml: string
  storeUrl: string
}): string {
  const { preheader, heading, bodyHtml, storeUrl } = opts
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0; padding:0; background:${BG}; -webkit-font-smoothing:antialiased;">
  <span style="display:none!important; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden;">${escapeHtml(
    preheader
  )}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid ${LINE}; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="background:${NAVY}; padding:22px 32px;">
              <a href="${escapeAttr(storeUrl)}" style="color:#ffffff; font-family:Georgia,'Times New Roman',serif; font-size:20px; font-weight:700; letter-spacing:0.04em; text-decoration:none;">${STORE_NAME}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:${INK};">
              <h1 style="margin:0 0 16px; font-size:22px; line-height:1.3; color:${NAVY};">${escapeHtml(
                heading
              )}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; border-top:1px solid ${LINE}; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px; font-size:12px; line-height:1.5; color:${MUTED};">${escapeHtml(
                RUO_LINE
              )}</p>
              <p style="margin:0; font-size:12px; color:${MUTED};">© 2026 ${STORE_NAME} · <a href="${escapeAttr(
    storeUrl
  )}" style="color:${MUTED};">longevbiotech.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function btn(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${NAVY}; border-radius:8px;"><a href="${escapeAttr(
    href
  )}" style="display:inline-block; padding:12px 22px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${escapeHtml(
    label
  )}</a></td></tr></table>`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
function escapeAttr(s: string): string {
  return escapeHtml(s)
}

/* ------------------------------------------------------------------ */
/* Welcome — sent on customer.created (S3, the primary deliverable)    */
/* ------------------------------------------------------------------ */

export function buildWelcomeEmail(opts: {
  firstName?: string | null
  storeUrl: string
}): EmailParts {
  const name = opts.firstName?.trim()
  const greeting = name ? `Welcome, ${name}` : "Welcome to Longev Biotech"
  const storeUrl = opts.storeUrl
  const catalogUrl = `${storeUrl.replace(/\/$/, "")}/us/store`

  const bodyHtml = `
    <p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:${INK};">
      Thanks for creating an account. You now have access to product pricing and can place
      research orders across our peptide catalog.
    </p>
    <p style="margin:0 0 4px; font-size:15px; line-height:1.6; color:${INK};">
      Every product ships with a Certificate of Analysis and is intended strictly for
      laboratory research.
    </p>
    ${btn(catalogUrl, "Browse the catalog")}
    <p style="margin:0; font-size:13px; line-height:1.6; color:${MUTED};">
      Questions? Just reply to this email and it reaches our team directly.
    </p>`

  const text = `${greeting}

Thanks for creating an account with Longev Biotech. You now have access to product pricing and can place research orders across our peptide catalog.

Every product ships with a Certificate of Analysis and is intended strictly for laboratory research.

Browse the catalog: ${catalogUrl}

Questions? Just reply to this email and it reaches our team directly.

${RUO_LINE}
© 2026 Longev Biotech · longevbiotech.com`

  return {
    subject: "Welcome to Longev Biotech",
    html: shell({
      preheader: "Your account is ready — pricing and research ordering are now unlocked.",
      heading: greeting,
      bodyHtml,
      storeUrl,
    }),
    text,
  }
}

/* ------------------------------------------------------------------ */
/* Order confirmation — sent to the buyer on order.placed             */
/* ------------------------------------------------------------------ */

export type OrderLine = { title: string; quantity: number; unitPrice: number }

export function buildOrderConfirmationEmail(opts: {
  displayId: number | string
  firstName?: string | null
  currencyCode: string
  total: number
  items: OrderLine[]
  storeUrl: string
}): EmailParts {
  const { displayId, currencyCode, total, items, storeUrl } = opts
  const money = (n: number) => formatMoney(n, currencyCode)
  const name = opts.firstName?.trim()

  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:8px 0; font-size:14px; color:${INK}; border-bottom:1px solid ${LINE};">${escapeHtml(
        it.title
      )} <span style="color:${MUTED};">× ${it.quantity}</span></td>
        <td align="right" style="padding:8px 0; font-size:14px; color:${INK}; border-bottom:1px solid ${LINE}; white-space:nowrap;">${money(
        it.unitPrice * it.quantity
      )}</td>
      </tr>`
    )
    .join("")

  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:${INK};">
      ${name ? `Thanks, ${escapeHtml(name)} — ` : "Thanks — "}we've received your order
      <strong>#${escapeHtml(String(displayId))}</strong>. Here's a summary:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      ${rows}
      <tr>
        <td style="padding:12px 0 0; font-size:15px; font-weight:700; color:${NAVY};">Total</td>
        <td align="right" style="padding:12px 0 0; font-size:15px; font-weight:700; color:${NAVY};">${money(
          total
        )}</td>
      </tr>
    </table>
    <p style="margin:18px 0 0; font-size:13px; line-height:1.6; color:${MUTED};">
      A Certificate of Analysis ships with every order. Reply to this email with any
      questions about your research order.
    </p>`

  const text = `Order #${displayId} confirmed

${name ? `Thanks, ${name} — ` : "Thanks — "}we've received your order.

${items.map((it) => `- ${it.title} × ${it.quantity}  ${money(it.unitPrice * it.quantity)}`).join("\n")}
Total: ${money(total)}

A Certificate of Analysis ships with every order. Reply to this email with any questions.

${RUO_LINE}
© 2026 Longev Biotech · longevbiotech.com`

  return {
    subject: `Your Longev Biotech order #${displayId}`,
    html: shell({
      preheader: `Order #${displayId} confirmed — ${money(total)}`,
      heading: `Order #${displayId} confirmed`,
      bodyHtml,
      storeUrl,
    }),
    text,
  }
}

/* ------------------------------------------------------------------ */
/* Ops alert — internal new-order ping (only if OPS_NOTIFICATION_EMAIL) */
/* ------------------------------------------------------------------ */

export function buildOpsAlertEmail(opts: {
  displayId: number | string
  email: string
  currencyCode: string
  total: number
  items: OrderLine[]
  storeUrl: string
}): EmailParts {
  const { displayId, email, currencyCode, total, items, storeUrl } = opts
  const money = (n: number) => formatMoney(n, currencyCode)
  const lines = items
    .map((it) => `${it.title} × ${it.quantity} — ${money(it.unitPrice * it.quantity)}`)
    .join("<br/>")

  const bodyHtml = `
    <p style="margin:0 0 12px; font-size:15px; color:${INK};">New order <strong>#${escapeHtml(
      String(displayId)
    )}</strong> — <strong>${money(total)}</strong></p>
    <p style="margin:0 0 12px; font-size:14px; color:${INK};">Customer: ${escapeHtml(email)}</p>
    <p style="margin:0; font-size:14px; line-height:1.7; color:${INK};">${lines}</p>`

  const text = `New order #${displayId} — ${money(total)}
Customer: ${email}
${items.map((it) => `- ${it.title} × ${it.quantity}  ${money(it.unitPrice * it.quantity)}`).join("\n")}`

  return {
    subject: `🧪 New order #${displayId} — ${money(total)}`,
    html: shell({
      preheader: `${email} — ${money(total)}`,
      heading: `New order #${displayId}`,
      bodyHtml,
      storeUrl,
    }),
    text,
  }
}

/**
 * Format a Medusa v2 amount. v2 stores prices in MAJOR units (99 = $99, not cents),
 * so no /100. Falls back to a plain `${code} ${n}` string if Intl lacks the currency.
 */
function formatMoney(amount: number, currencyCode: string): string {
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
    }).format(n)
  } catch {
    return `${currencyCode.toUpperCase()} ${n.toFixed(2)}`
  }
}
