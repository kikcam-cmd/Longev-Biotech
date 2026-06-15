import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LOT_COA_MODULE } from "../../../../../modules/lot-coa"

/**
 * Admin lot management for a product (Longev). Powers the "Lot & Certificate of
 * Analysis" widget on the product detail page.
 *
 *   GET  /admin/products/:id/lots   → list this product's lots (newest first)
 *   POST /admin/products/:id/lots   → create a lot for this product
 *
 * Auth: under /admin/* so the stock admin-session guard applies automatically.
 */

// Whitelist + coerce the writable lot fields; ignore anything else in the body.
export const sanitizeLot = (body: Record<string, any>) => {
  const out: Record<string, any> = {}
  for (const k of ["lot_number", "variant_id", "purity_text", "strength", "lab_name", "test_method", "endotoxin", "coa_file_id"]) {
    if (body[k] !== undefined) out[k] = body[k] === "" ? null : body[k]
  }
  if (body.purity_pct !== undefined && body.purity_pct !== "") out.purity_pct = Number(body.purity_pct)
  if (body.measured_mass !== undefined && body.measured_mass !== "") out.measured_mass = Number(body.measured_mass)
  if (body.released_at !== undefined && body.released_at !== "") out.released_at = new Date(body.released_at)
  return out
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const lotService: any = req.scope.resolve(LOT_COA_MODULE)
  const lots = await lotService.listLots(
    { product_id: req.params.id },
    { order: { released_at: "DESC" }, take: 50 }
  )
  res.json({ lots })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const lotService: any = req.scope.resolve(LOT_COA_MODULE)
  const data = sanitizeLot((req.body ?? {}) as Record<string, any>)
  if (!data.lot_number) {
    return res.status(400).json({ message: "lot_number is required" })
  }
  const created = await lotService.createLots({ product_id: req.params.id, ...data })
  res.json({ lot: Array.isArray(created) ? created[0] : created })
}
