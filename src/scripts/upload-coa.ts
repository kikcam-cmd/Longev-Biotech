import fs from "fs"
import path from "path"
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { LOT_COA_MODULE } from "../modules/lot-coa"

/**
 * Upload a Certificate of Analysis (CoA) for a lot and wire it to that lot.
 *
 *   npm run coa:upload -- <lot_number> <path/to/coa.pdf>
 *   # e.g.
 *   npm run coa:upload -- BPC157-2406-A ~/Desktop/BPC157-2406-A.pdf
 *
 *   # or directly:
 *   npx medusa exec ./src/scripts/upload-coa.ts BPC157-2406-A ~/Desktop/coa.pdf
 *
 * What it does:
 *   1. Reads the file from disk and uploads it to Medusa's File module as a
 *      PRIVATE object (S3 in prod, local provider in dev).
 *   2. Sets `coa_file_id` on the matching lot so `GET /store/lots/:lot/coa` stops
 *      404ing and starts minting short-lived signed URLs.
 *
 * Idempotent-ish: re-running uploads a fresh object (new key) and repoints the
 * lot at it. The old object is left in the bucket (delete manually if needed).
 */

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

export default async function uploadCoa({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const [lotNumber, rawPath] = args ?? []
  if (!lotNumber || !rawPath) {
    logger.error(
      "Usage: npm run coa:upload -- <lot_number> <path/to/coa.pdf>"
    )
    throw new Error("Missing required arguments: <lot_number> <file_path>")
  }

  // Resolve ~ and relative paths against the invoking shell's cwd.
  const filePath = path.resolve(
    rawPath.startsWith("~")
      ? path.join(process.env.HOME ?? "", rawPath.slice(1))
      : rawPath
  )
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const ext = path.extname(filePath).toLowerCase()
  const mimeType = MIME_BY_EXT[ext]
  if (!mimeType) {
    throw new Error(
      `Unsupported file type "${ext}". Allowed: ${Object.keys(MIME_BY_EXT).join(", ")}`
    )
  }

  // Find the lot first so we never upload an orphan object for a typo'd lot number.
  const lotService: any = container.resolve(LOT_COA_MODULE)
  const [lot] = await lotService.listLots({ lot_number: lotNumber })
  if (!lot) {
    throw new Error(
      `No lot found with lot_number "${lotNumber}". Seed it first (see seed.ts).`
    )
  }

  // Name the object after the lot so it's identifiable in the bucket.
  const filename = `${lotNumber}${ext}`
  // Providers expect base64-encoded content (they round-trip to detect it).
  const content = fs.readFileSync(filePath).toString("base64")

  const fileModule: any = container.resolve(Modules.FILE)
  logger.info(`Uploading CoA "${filename}" (${mimeType}) for lot ${lotNumber}…`)
  const uploaded = await fileModule.createFiles({
    filename,
    mimeType,
    content,
    access: "private", // private ACL → served only via signed URLs
  })

  await lotService.updateLots({ id: lot.id, coa_file_id: uploaded.id })

  logger.info(`✅ CoA stored. file_id (coa_file_id) = ${uploaded.id}`)
  logger.info(
    `   Verify: GET /store/lots/${lotNumber}/coa now returns a signed coa_url.`
  )
}
