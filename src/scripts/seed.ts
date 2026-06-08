import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { LOT_COA_MODULE } from "../modules/lot-coa"

/**
 * Seeds the Longev Biotech catalog (BPC-157 + GLP-1) ported from the original
 * Supabase seed, plus a representative BPC-157 lot.
 *
 * Run AFTER Medusa's base seed (`npx medusa db:seed`) which creates the default
 * store, region (USD), sales channel and stock location.
 *
 *   npm run seed
 */
export default async function seedLongev({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Default sales channel created by the base seed
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const salesChannelId = channels?.[0]?.id
  if (!salesChannelId) {
    throw new Error(
      "No sales channel found. Run `npx medusa db:seed` first to create the base store."
    )
  }

  logger.info("Seeding Longev Biotech catalog…")

  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "BPC-157",
          subtitle: "Body Protection Compound-157",
          handle: "bpc-157",
          status: ProductStatus.PUBLISHED,
          description:
            "BPC-157 is a synthetic peptide derived from a protective protein found in human gastric juice. It is widely studied in research settings for its potential role in tissue repair mechanisms, wound healing pathways, gastrointestinal integrity, tendon and ligament research, and inflammation-related signaling processes. Each production lot is analytically verified using HPLC-UV-MS to confirm molecular identity and purity, and is supplied strictly for laboratory research use.",
          sales_channels: [{ id: salesChannelId }],
          // Spec fields preserved as metadata (label specs, NOT per-lot guarantees)
          metadata: {
            cas_number: "137525-51-0",
            molecular_formula: "C62H98N16O22",
            avg_mol_weight: 1419.5,
            monoisotopic_mass: 1418.7,
            purity_spec: ">=99%",
            method: "HPLC-UV-MS",
            made_in: "USA",
            quantity_mg: 10,
            format: "Lyophilized Powder",
            research_use_only: true,
          },
          options: [{ title: "Size", values: ["10 mg"] }],
          variants: [
            {
              title: "10 mg",
              sku: "BPC157-10MG",
              options: { Size: "10 mg" },
              manage_inventory: true,
              prices: [{ amount: 9900, currency_code: "usd" }], // $99.00 placeholder — set real price
            },
          ],
        },
        {
          title: "GLP-1",
          subtitle: "Research Peptide",
          handle: "glp-1",
          status: ProductStatus.PUBLISHED,
          description:
            "A high-purity, lyophilized research peptide supplied in 30 mg vials. Every production lot is analytically verified by HPLC-UV-MS to confirm molecular identity and purity. Intended strictly for laboratory research and analytical applications.",
          sales_channels: [{ id: salesChannelId }],
          metadata: {
            cas_number: "910463-68-2",
            molecular_formula: "C187H291N45O59",
            avg_mol_weight: 4113.64,
            monoisotopic_mass: 4111.12,
            purity_spec: ">=99%",
            method: "HPLC-UV-MS",
            made_in: "USA",
            quantity_mg: 30,
            format: "Lyophilized Powder",
            research_use_only: true,
          },
          options: [{ title: "Size", values: ["30 mg"] }],
          variants: [
            {
              title: "30 mg",
              sku: "GLP1-30MG",
              options: { Size: "30 mg" },
              manage_inventory: true,
              prices: [{ amount: 18900, currency_code: "usd" }], // $189.00 placeholder
            },
          ],
        },
      ],
    },
  })

  logger.info(`Seeded ${products.length} products.`)

  // Representative BPC-157 lot (CoA file uploaded separately, then set coa_file_id)
  const bpc = products.find((p: any) => p.handle === "bpc-157")
  if (bpc) {
    const lotService: any = container.resolve(LOT_COA_MODULE)
    const existing = await lotService.listLots({ lot_number: "BPC157-2406-A" })
    if (!existing?.length) {
      await lotService.createLots({
        product_id: bpc.id,
        variant_id: bpc.variants?.[0]?.id ?? null,
        lot_number: "BPC157-2406-A",
        purity_pct: 99.4,
        measured_mass: 1418.71,
        released_at: new Date(),
      })
      logger.info("Seeded representative lot BPC157-2406-A.")
    }
  }

  logger.info("Longev seed complete.")
}
