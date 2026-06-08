import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
  Logger,
} from "@medusajs/framework/types"

/**
 * NMI (Network Merchants Inc.) payment provider for Medusa v2.
 *
 * Why NMI: peptide / research-chemical sellers are "high risk" and cannot use
 * aggregators (Stripe/PayPal/Square). NMI is a gateway that sits on top of YOUR
 * own high-risk merchant account (MID). Cards are tokenized client-side with
 * NMI Collect.js, so this server only ever handles a one-time `payment_token`
 * — never a PAN. That keeps your PCI scope at SAQ A.
 *
 * Flow:
 *   storefront (Collect.js)  ->  payment_token
 *   initiatePayment()        ->  creates the Medusa payment session
 *   authorizePayment()       ->  NMI type=auth using payment_token
 *   capturePayment()         ->  NMI type=capture using transactionid
 *   refundPayment()          ->  NMI type=refund
 *   cancelPayment()          ->  NMI type=void
 *
 * To swap to Authorize.Net later, only the private `nmiRequest()` calls and the
 * field names change — the Medusa method contracts below stay identical.
 *
 * Targets @medusajs/framework 2.15.x. Run `npm run build` after install to typecheck.
 */

type NmiOptions = {
  securityKey: string
  apiUrl?: string
  webhookSecret?: string
}

type InjectedDependencies = {
  logger: Logger
}

type NmiSessionData = {
  payment_token?: string
  transactionid?: string
  auth_code?: string
  avsresponse?: string
  cvvresponse?: string
  last_response?: Record<string, string>
}

const DEFAULT_API_URL = "https://secure.nmi.com/api/transact.php"

export default class NmiPaymentProviderService extends AbstractPaymentProvider<NmiOptions> {
  static identifier = "nmi"

  protected readonly options_: NmiOptions
  protected readonly logger_: Logger

  constructor(container: InjectedDependencies, options: NmiOptions) {
    super(container, options)
    this.options_ = options
    this.logger_ = container.logger
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.securityKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "NMI payment provider requires a `securityKey` option (NMI gateway Security Key)."
      )
    }
  }

  /**
   * Low-level call to the NMI Payment API. NMI takes form-encoded params and
   * returns a urlencoded query string (response=1 approved, 2 declined, 3 error).
   */
  private async nmiRequest(
    params: Record<string, string | number | undefined>
  ): Promise<Record<string, string>> {
    const body = new URLSearchParams()
    body.set("security_key", this.options_.securityKey)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        body.set(k, String(v))
      }
    }

    const res = await fetch(this.options_.apiUrl || DEFAULT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    if (!res.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `NMI gateway HTTP error: ${res.status}`
      )
    }

    const text = await res.text()
    const parsed: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(text).entries()) {
      parsed[k] = v
    }
    return parsed
  }

  /** NMI sends amounts as decimal dollars; Medusa stores minor units (cents). */
  private toNmiAmount(amount: number): string {
    return (Number(amount) / 100).toFixed(2)
  }

  private isApproved(r: Record<string, string>): boolean {
    return r.response === "1"
  }

  // ---------------------------------------------------------------------------
  // Medusa payment provider contract
  // ---------------------------------------------------------------------------

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    // No money moves yet. We just open a session and carry forward the one-time
    // card token that the storefront produced with Collect.js.
    const token = (input.data?.payment_token as string) || undefined
    const data: NmiSessionData = { payment_token: token }

    return {
      id: `nmi_${input.context?.idempotency_key ?? Date.now()}`,
      data: data as unknown as Record<string, unknown>,
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const sessionData = (input.data ?? {}) as NmiSessionData
    const token =
      (input.context?.payment_token as string) || sessionData.payment_token

    if (!token) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "NMI authorize: missing one-time `payment_token` from Collect.js."
      )
    }

    const amount = (input as unknown as { amount: number }).amount
    const currency =
      (input as unknown as { currency_code?: string }).currency_code || "usd"

    const r = await this.nmiRequest({
      type: "auth",
      payment_token: token,
      amount: this.toNmiAmount(amount),
      currency: currency.toUpperCase(),
    })

    if (!this.isApproved(r)) {
      this.logger_.warn(`NMI auth declined: ${r.responsetext} (${r.response_code})`)
      return {
        status: "error" as PaymentSessionStatus,
        data: { ...sessionData, last_response: r },
      }
    }

    return {
      status: "authorized" as PaymentSessionStatus,
      data: {
        ...sessionData,
        transactionid: r.transactionid,
        auth_code: r.authcode,
        avsresponse: r.avsresponse,
        cvvresponse: r.cvvresponse,
        last_response: r,
      },
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = (input.data ?? {}) as NmiSessionData
    if (!data.transactionid) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "NMI capture: no `transactionid` on the payment session."
      )
    }

    const r = await this.nmiRequest({
      type: "capture",
      transactionid: data.transactionid,
    })

    if (!this.isApproved(r)) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `NMI capture failed: ${r.responsetext}`
      )
    }

    return { data: { ...data, last_response: r } }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as NmiSessionData
    const amount = (input as unknown as { amount: number }).amount

    const r = await this.nmiRequest({
      type: "refund",
      transactionid: data.transactionid,
      amount: this.toNmiAmount(amount),
    })

    if (!this.isApproved(r)) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `NMI refund failed: ${r.responsetext}`
      )
    }

    return { data: { ...data, last_response: r } }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    const data = (input.data ?? {}) as NmiSessionData
    if (data.transactionid) {
      // void an un-captured auth
      await this.nmiRequest({ type: "void", transactionid: data.transactionid })
    }
    return { data }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    // Same as cancel for NMI — release any open auth.
    return this.cancelPayment(input)
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as NmiSessionData
    if (!data.transactionid) {
      return { status: "pending" as PaymentSessionStatus, data }
    }
    // NMI Query API could be called here for live status; we trust local state.
    return { status: "authorized" as PaymentSessionStatus, data }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    // Carry a refreshed token if the storefront re-tokenized the card.
    const token = input.data?.payment_token as string | undefined
    return {
      data: { ...(input.data ?? {}), ...(token ? { payment_token: token } : {}) },
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // NMI can POST transaction webhooks. Verify the HMAC signature if configured,
    // then map the event to a Medusa action. Left minimal until webhooks are set up.
    const body = payload.data as Record<string, any>

    if (body?.event_type === "transaction.sale.success" || body?.response === "1") {
      return {
        action: "captured",
        data: {
          session_id: body?.order_id ?? body?.merchant_defined_field_1,
          amount: Number(body?.amount ?? 0) * 100,
        },
      }
    }

    return { action: "not_supported" }
  }
}
