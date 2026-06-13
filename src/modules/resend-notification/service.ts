import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend } from "resend"

type InjectedDependencies = {
  logger: Logger
}

export type ResendNotificationOptions = {
  /** Resend API key (re_…). */
  apiKey: string
  /** Default From, e.g. `Longev Biotech <noreply@longevbiotech.com>`. */
  from: string
  /** Default Reply-To (the Proton inbox), e.g. `support@longevbiotech.com`. */
  replyTo?: string
}

/**
 * Resend email provider for Medusa's Notification module.
 *
 * Deliberately a *thin* provider: callers compose subject + html/text and pass it
 * via the notification `content` field; this just forwards to Resend. That keeps the
 * email copy in `src/lib/email-templates.ts` (testable, no template registry here) and
 * lets the same provider serve welcome, order-confirmation and ops-alert mails.
 *
 * Registered only when RESEND_API_KEY is set (see medusa-config.ts) — same gating
 * pattern as the S3 file provider and the NMI payment provider, so the backend still
 * boots without email configured.
 */
class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend"

  protected logger_: Logger
  protected options_: ResendNotificationOptions
  protected client_: Resend

  constructor({ logger }: InjectedDependencies, options: ResendNotificationOptions) {
    super()
    this.logger_ = logger
    this.options_ = options
    this.client_ = new Resend(options.apiKey)
  }

  static validateOptions(options: Record<string, unknown>): void {
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Resend notification provider requires `apiKey`."
      )
    }
    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Resend notification provider requires a `from` address."
      )
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const from = notification.from || this.options_.from
    const replyTo =
      (notification.provider_data?.reply_to as string | undefined) ||
      this.options_.replyTo

    const subject =
      notification.content?.subject ||
      (notification.data?.subject as string | undefined) ||
      "Longev Biotech"

    const html =
      notification.content?.html ||
      (notification.data?.html as string | undefined)
    const text =
      notification.content?.text ||
      (notification.data?.text as string | undefined)

    if (!html && !text) {
      // A missing body must not crash the workflow that triggered the notification —
      // log loudly and no-op. (Resend itself rejects a send with no html/text/react.)
      this.logger_.warn(
        `[resend] skipping "${notification.template}" → ${notification.to}: no html/text content`
      )
      return {}
    }

    // Build the payload as `any`: Resend's CreateEmailOptions is a union requiring at
    // least one of html/text/react, which TS can't narrow from our optional fields.
    const payload: Record<string, unknown> = {
      from,
      to: notification.to,
      subject,
    }
    if (replyTo) payload.replyTo = replyTo
    if (html) payload.html = html
    if (text) payload.text = text
    if (notification.provider_data?.cc) payload.cc = notification.provider_data.cc
    if (notification.provider_data?.bcc) payload.bcc = notification.provider_data.bcc
    if (notification.attachments?.length) {
      payload.attachments = notification.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.content_type,
      }))
    }

    const { data, error } = await this.client_.emails.send(payload as any)

    if (error) {
      this.logger_.error(
        `[resend] send failed ("${notification.template}" → ${notification.to}): ${error.message}`
      )
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Resend send failed: ${error.message}`
      )
    }

    this.logger_.info(
      `[resend] sent "${notification.template}" → ${notification.to} (id=${data?.id})`
    )
    return { id: data?.id }
  }
}

export default ResendNotificationProviderService
