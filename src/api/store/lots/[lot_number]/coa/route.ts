import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { LOT_COA_MODULE } from "../../../../../modules/lot-coa"

/**
 * GET /store/lots/:lot_number/coa
 *
 * Returns a short-lived signed URL to the lot's Certificate of Analysis. CoA files
 * live in a private bucket via Medusa's File module; we never expose a public path.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const lotNumber = req.params.lot_number

  const lotService: any = req.scope.resolve(LOT_COA_MODULE)
  const [lot] = await lotService.listLots({ lot_number: lotNumber })

  if (!lot || !lot.coa_file_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No Certificate of Analysis on file for lot ${lotNumber}.`
    )
  }

  const fileModule = req.scope.resolve(Modules.FILE)
  const file = await fileModule.retrieveFile(lot.coa_file_id)

  return res.json({
    lot_number: lot.lot_number,
    purity_pct: lot.purity_pct,
    released_at: lot.released_at,
    coa_url: file.url,
  })
}
