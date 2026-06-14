import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { LOT_COA_MODULE } from "../../../../../modules/lot-coa"

/**
 * GET /store/products/:id/lot-coa
 *
 * Returns the current lot's Certificate of Analysis for a product, for the PDP
 * "This Batch's Lab Report" hero. Picks the most recently released lot, preferring
 * one that has a CoA file uploaded. `coa_url` is a short-lived signed URL minted by
 * Medusa's File module (CoA files live in a private bucket — never a public path).
 *
 * Always 200s: `{ lot: null }` when no lot exists for the product, so the storefront
 * renders a graceful "ships with every order" state instead of erroring.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id

  const lotService: any = req.scope.resolve(LOT_COA_MODULE)
  const lots = await lotService.listLots(
    { product_id: productId },
    { order: { released_at: "DESC" }, take: 25 }
  )

  if (!lots?.length) {
    return res.json({ lot: null })
  }

  // Prefer the most recent lot that actually has a certificate on file.
  const lot = lots.find((l: any) => l.coa_file_id) ?? lots[0]

  let coa_url: string | null = null
  if (lot.coa_file_id) {
    const fileModule = req.scope.resolve(Modules.FILE)
    const file = await fileModule.retrieveFile(lot.coa_file_id)
    coa_url = file?.url ?? null
  }

  return res.json({
    lot: {
      lot_number: lot.lot_number,
      purity_pct: lot.purity_pct ?? null,
      purity_text: lot.purity_text ?? null,
      strength: lot.strength ?? null,
      lab_name: lot.lab_name ?? null,
      test_method: lot.test_method ?? null,
      endotoxin: lot.endotoxin ?? null,
      released_at: lot.released_at ?? null,
      coa_url,
    },
  })
}
