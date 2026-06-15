import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LOT_COA_MODULE } from "../../../../modules/lot-coa"
import { sanitizeLot } from "../../products/[id]/lots/route"

/**
 * Update / delete a single lot (Longev admin lot widget).
 *
 *   POST   /admin/lots/:id  → update writable fields (incl. coa_file_id)
 *   DELETE /admin/lots/:id  → remove the lot
 */

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const lotService: any = req.scope.resolve(LOT_COA_MODULE)
  const data = sanitizeLot((req.body ?? {}) as Record<string, any>)
  const updated = await lotService.updateLots({ id: req.params.id, ...data })
  res.json({ lot: Array.isArray(updated) ? updated[0] : updated })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const lotService: any = req.scope.resolve(LOT_COA_MODULE)
  await lotService.deleteLots([req.params.id])
  res.json({ id: req.params.id, object: "lot", deleted: true })
}
