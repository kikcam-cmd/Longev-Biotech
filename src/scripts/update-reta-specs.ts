import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Fill in the molecule-level identity specs for Retatrutide (open thread #3).
 * These are PRODUCT-level label specs (fixed properties of the molecule), NOT
 * per-lot measured values — those live on the lot/CoA record and are untouched.
 *
 *   npm run reta:specs
 *
 * Source of truth = the CAS already on file (2381089-83-2 = retatrutide free
 * base, per PubChem/Sigma). The vendor sheet Cameron supplied listed the
 * trifluoroacetate-SALT formula (C223H343F3N46O70 = free base + 1 CF3COOH) but
 * paired it with the free-base mass (4728.47) — internally inconsistent. The CAS
 * is the free base, so we display the free-base formula, which reconciles with
 * both masses (monoisotopic of C221H342N46O68 ≈ 4728.46 Da):
 *   - Molecular Formula : C221H342N46O68   (free base; matches the CAS)
 *   - Avg. Mol. Weight  : 4731.41 g/mol    (Sigma / PubChem)
 *   - Monoisotopic Mass : 4728.47 Da       (vendor sheet "expected"; calc 4728.46)
 *
 * NOT changed here (coupled to the lot/CoA decision, still open):
 *   - method stays "HPLC-UV/VIS" to match the on-file Vanguard lot CoA. The
 *     sheet's "HPLC-UV-MS" + measured purity 99.6% describe a DIFFERENT lot than
 *     the 99.54% Vanguard cert currently attached to lot 1234 — don't mix them.
 *
 * IDEMPOTENT: merges onto existing metadata; re-running is a no-op.
 */
const HANDLE = "retatrutide"

const NEW_SPECS = {
  molecular_formula: "C221H342N46O68",
  avg_mol_weight: "4731.41",
  monoisotopic_mass: "4728.47",
}

export default async function updateRetaSpecs({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productService = container.resolve(Modules.PRODUCT)

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata"],
    filters: { handle: HANDLE },
  })
  const product = data?.[0]
  if (!product) throw new Error(`Product "${HANDLE}" not found.`)

  const merged = { ...(product.metadata ?? {}), ...NEW_SPECS }
  await productService.updateProducts(product.id, { metadata: merged })

  logger.info(`Updated ${product.title} (${product.id}) metadata:`)
  for (const [k, v] of Object.entries(NEW_SPECS)) logger.info(`  ${k} = ${v}`)
  logger.info("CAS / purity_spec / method / format / made_in left as-is.")
}
