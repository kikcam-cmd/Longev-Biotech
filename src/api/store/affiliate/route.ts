import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { randomBytes } from "crypto"
import { REFERRAL_MODULE } from "../../../modules/referral"

// Unambiguous alphabet (no 0/O/1/I) for human-shareable codes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateCode(): string {
  const bytes = randomBytes(6)
  let s = ""
  for (let i = 0; i < 6; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return `LB-${s}`
}

function requireCustomerId(req: AuthenticatedMedusaRequest): string {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be signed in to access the affiliate program."
    )
  }
  return customerId
}

async function summarize(referral: any, affiliate: any) {
  const referredOrders = await referral.listReferralOrders({
    affiliate_customer_id: affiliate.customer_id,
  })
  const totalValue = referredOrders.reduce(
    (sum: number, r: any) => sum + (Number(r.order_total) || 0),
    0
  )
  return {
    affiliate: { code: affiliate.code },
    stats: {
      referred_orders: referredOrders.length,
      total_value: totalValue,
    },
  }
}

/**
 * GET /store/affiliate
 * Returns the signed-in customer's affiliate record + referral stats, or
 * { affiliate: null } if they have not joined the program yet.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customerId = requireCustomerId(req)
  const referral: any = req.scope.resolve(REFERRAL_MODULE)

  const [affiliate] = await referral.listAffiliates({ customer_id: customerId })
  if (!affiliate) {
    return res.status(200).json({ affiliate: null, stats: null })
  }

  return res.status(200).json(await summarize(referral, affiliate))
}

/**
 * POST /store/affiliate
 * Idempotently provisions the signed-in customer as an affiliate (instant,
 * self-serve, no approval) and returns their code + stats. No payouts.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customerId = requireCustomerId(req)
  const referral: any = req.scope.resolve(REFERRAL_MODULE)

  const [existing] = await referral.listAffiliates({ customer_id: customerId })
  if (existing) {
    return res.status(200).json(await summarize(referral, existing))
  }

  // Generate a code that is not already taken (retry on the rare collision).
  let code = ""
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode()
    const [taken] = await referral.listAffiliates({ code: candidate })
    if (!taken) {
      code = candidate
      break
    }
  }
  if (!code) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Could not generate a unique referral code; please try again."
    )
  }

  const affiliate = await referral.createAffiliates({
    customer_id: customerId,
    code,
  })

  return res.status(201).json(await summarize(referral, affiliate))
}
