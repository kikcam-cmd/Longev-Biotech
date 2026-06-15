import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Seed the 2026-06 catalog batch: HCG, KLOW, GLOW, CJC-1295/Ipamorelin (No DAC),
 * MOTS-c, GHK-Cu, Tesamorelin — each a single-size product.
 *
 *   npm run catalog:extra
 *
 * IDEMPOTENT by handle: a product that already exists is left untouched (re-run
 * safe). Each new variant is stocked at the US Warehouse (update-or-create, so it
 * cooperates with the variant-stock-init subscriber's qty-0 seed instead of racing
 * it). Volume tiers are applied by the variant-tiers-init subscriber on create;
 * run `npm run volume:tiers` afterward to guarantee them (the documented safety net).
 *
 * Prices mirror americanpeptides.us for the matching size (Cameron, 2026-06-14):
 *   KLOW 80mg $200 · GLOW 70mg $150 · CJC/Ipa 5/5mg $90 · MOTS-c 10mg $100 ·
 *   GHK-Cu 50mg $40 (AP 50mg is sold-out; listing price) · Tesamorelin 10mg $120.
 *   HCG has no AP match → $100 placeholder (set a real price in Admin).
 *
 * Spec data is AP-corrected — the vendor sheets Cameron supplied had real errors
 * (Tesamorelin MW 2147.6 → 5135.86; GHK-Cu CAS/MW were the copper-FREE peptide's;
 * CJC no-DAC MW 3647.2 was the with-DAC mass). Blends carry composition in the
 * description and leave the single-value molecular grid fields blank (the PDP grid
 * can't represent multiple components; matches AP's KLOW/GLOW presentation).
 *
 * Prereq: base catalog seeded (`npm run seed`) — sales channel / shipping profile /
 * US Warehouse must exist. Medusa v2 prices are MAJOR units (100 = $100).
 */

const STOCK_QTY = 100000

type ProductDef = {
  title: string
  handle: string
  subtitle?: string
  description: string
  size: string
  sku: string
  price: number
  metadata: Record<string, unknown>
}

const PRODUCTS: ProductDef[] = [
  {
    title: "HCG",
    handle: "hcg",
    subtitle: "Human Chorionic Gonadotropin",
    description:
      "HCG (human chorionic gonadotropin) is a glycoprotein hormone supplied as a lyophilized powder for laboratory research use. Each vial is intended strictly for controlled in-vitro and analytical applications and must be reconstituted before use. Not for human or veterinary use. For Research Use Only.",
    size: "10000 IU",
    sku: "HCG-10000IU",
    price: 100,
    // HCG is a glycoprotein measured in IU, not mg — no molecular grid, no
    // quantity_mg. Sparse on purpose; flesh out in Admin if specs arrive.
    metadata: {
      format: "Lyophilized Powder",
      research_use_only: true,
    },
  },
  {
    title: "KLOW",
    handle: "klow",
    subtitle: "Four-Peptide Research Blend",
    description:
      "KLOW is a research-grade multi-peptide blend combining four peptides — GHK-Cu, BPC-157, TB-500, and KPV — in a single lyophilized formulation for advanced laboratory research into tissue-repair mechanisms, inflammation-modulation pathways, cellular regeneration, and extracellular-matrix signaling. Composition: GHK-Cu 50 mg · TB-500 10 mg · BPC-157 10 mg · KPV 10 mg (80 mg total). Each component possesses a distinct molecular identity; each lot undergoes HPLC-UV-MS analysis to confirm identity and purity. Supplied as a lyophilized powder and must be reconstituted. Not FDA-approved for medical or veterinary use. For Research Use Only.",
    size: "80 mg",
    sku: "KLOW-80MG",
    price: 200,
    metadata: {
      purity_spec: "≥99%",
      method: "HPLC-UV-MS",
      made_in: "USA",
      format: "Lyophilized Powder",
      quantity_mg: "80",
      research_use_only: true,
    },
  },
  {
    title: "GLOW",
    handle: "glow",
    subtitle: "Three-Peptide Research Blend",
    description:
      "Glow is a multi-peptide research blend combining three peptides — GHK-Cu, BPC-157, and TB-500 — in a single lyophilized formulation for laboratory research into tissue repair, cellular regeneration, inflammation modulation, and collagen-support pathways. Composition: GHK-Cu 50 mg · BPC-157 10 mg · TB-500 10 mg (70 mg total). Each lot is analytically verified by HPLC-UV-MS to confirm identity and purity. Supplied as a lyophilized powder and must be reconstituted. Not FDA-approved for medical use. For Research Use Only.",
    size: "70 mg",
    sku: "GLOW-70MG",
    price: 150,
    metadata: {
      purity_spec: "≥99%",
      method: "HPLC-UV-MS",
      made_in: "USA",
      format: "Lyophilized Powder",
      quantity_mg: "70",
      research_use_only: true,
    },
  },
  {
    title: "CJC-1295 / Ipamorelin (No DAC)",
    handle: "cjc-1295-ipamorelin-no-dac",
    subtitle: "GHRH Analog + GH Secretagogue Blend",
    description:
      "CJC-1295 (No DAC) / Ipamorelin is a high-purity research blend of two growth-hormone-axis peptides supplied as a lyophilized powder. CJC-1295 (No DAC) is a short-acting GHRH analog (CAS 863288-34-0 · C152H252N44O42 · 3367.93 g/mol); Ipamorelin is a selective GH secretagogue (CAS 170851-70-4 · C38H49N9O5 · 711.85 g/mol). Composition: CJC-1295 (No DAC) 5 mg · Ipamorelin 5 mg (10 mg total). Each lot is analytically verified by HPLC-UV-MS to confirm molecular identity and purity. Must be reconstituted. Not for human consumption. For Research Use Only.",
    size: "5 mg / 5 mg",
    sku: "CJCIPA-5-5MG",
    price: 90,
    // Blend of two peptides — per-component identity lives in the description;
    // the single-value molecular grid + quantity_mg are intentionally omitted.
    metadata: {
      purity_spec: "≥99%",
      method: "HPLC-UV-MS",
      made_in: "USA",
      format: "Lyophilized Powder",
      research_use_only: true,
    },
  },
  {
    title: "MOTS-c",
    handle: "mots-c",
    subtitle: "Mitochondrial-Derived Peptide (16-aa)",
    description:
      "MOTS-c (Mitochondrial Open Reading Frame of the 12S rRNA-c) is a 16-amino-acid mitochondrial-derived peptide studied in research settings for its role in cellular-energy regulation, glucose metabolism, insulin sensitivity, and metabolic signaling. Each lot is verified by HPLC-UV-MS to confirm identity and purity. Supplied as a lyophilized powder and must be reconstituted. Not for human or veterinary use. For Research Use Only.",
    size: "10 mg",
    sku: "MOTSC-10MG",
    price: 100,
    metadata: {
      cas_number: "1627580-64-6",
      molecular_formula: "C101H152N28O22S2",
      avg_mol_weight: "2174.55",
      purity_spec: "≥99%",
      method: "HPLC-UV-MS",
      made_in: "USA",
      format: "Lyophilized Powder",
      quantity_mg: "10",
      research_use_only: true,
    },
  },
  {
    title: "GHK-Cu",
    handle: "ghk-cu",
    subtitle: "Copper-Binding Tripeptide",
    description:
      "GHK-Cu (glycyl-L-histidyl-L-lysine copper complex) is a naturally occurring copper-binding tripeptide studied in dermatological and regenerative research for collagen support, wound-healing, hair/scalp health, and antioxidant activity. Each lot is analytically verified to confirm copper complexation, molecular identity, and purity. Supplied as a lyophilized powder. Not for injection. Not FDA-approved for medical use. For Research Use Only.",
    size: "50 mg",
    sku: "GHKCU-50MG",
    price: 40,
    metadata: {
      cas_number: "89030-95-5",
      molecular_formula: "C14H22CuN6O4",
      avg_mol_weight: "403.93",
      purity_spec: "≥99%",
      method: "HPLC-UV-MS",
      made_in: "USA",
      format: "Lyophilized Powder",
      quantity_mg: "50",
      research_use_only: true,
    },
  },
  {
    title: "Tesamorelin",
    handle: "tesamorelin",
    subtitle: "GHRH Analog (44-aa)",
    description:
      "Tesamorelin is a synthetic 44-amino-acid analog of growth-hormone-releasing hormone (GHRH) studied in laboratory settings for metabolic signaling, visceral-adipose-tissue research, and body-composition pathways. Each lot is analytically verified by HPLC-UV-MS to confirm molecular identity and purity. Supplied as a lyophilized powder and must be reconstituted. Not for human consumption. For Research Use Only.",
    size: "10 mg",
    sku: "TESA-10MG",
    price: 120,
    metadata: {
      cas_number: "218949-48-5",
      molecular_formula: "C221H366N72O67S",
      avg_mol_weight: "5135.86",
      purity_spec: "≥99%",
      method: "HPLC-UV-MS",
      made_in: "USA",
      format: "Lyophilized Powder",
      quantity_mg: "10",
      research_use_only: true,
    },
  },
]

export default async function seedExtraCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

  // ── Resolve the existing catalog scaffolding (must already be seeded) ──────
  const [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })
  const [shippingProfile] =
    await fulfillmentModuleService.listShippingProfiles({ type: "default" })
  const { data: locs } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: "US Warehouse" },
  })
  const stockLocation = locs?.[0]

  if (!salesChannel || !shippingProfile || !stockLocation) {
    throw new Error(
      "Base catalog not found (sales channel / shipping profile / stock location). Run `npm run seed` first."
    )
  }

  const createdSkus: string[] = []

  // ── Create each product (idempotent by handle) ─────────────────────────────
  for (const def of PRODUCTS) {
    const { data: existing } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { handle: def.handle },
    })
    if (existing?.[0]) {
      logger.info(`Product "${def.handle}" already exists (${existing[0].id}) — skipping.`)
      continue
    }

    logger.info(`Creating ${def.title} (${def.size})…`)
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: def.title,
            subtitle: def.subtitle,
            handle: def.handle,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            description: def.description,
            sales_channels: [{ id: salesChannel.id }],
            metadata: def.metadata,
            options: [{ title: "Size", values: [def.size] }],
            variants: [
              {
                title: def.size,
                sku: def.sku,
                options: { Size: def.size },
                manage_inventory: true,
                prices: [{ amount: def.price, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
    createdSkus.push(def.sku)
    logger.info(`  ✓ ${def.title} created (SKU ${def.sku}, $${def.price}).`)
  }

  if (!createdSkus.length) {
    logger.info("No new products to seed (all handles already exist).")
    return
  }

  // ── Stock each new variant at the US Warehouse (update-or-create) ──────────
  // The variant-stock-init subscriber may have already seeded a qty-0 level for
  // some of these — update it rather than create a duplicate (which throws).
  for (const sku of createdSkus) {
    const { data: items } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku", "location_levels.location_id"],
      filters: { sku },
    })
    const item: any = items?.[0]
    if (!item?.id) {
      logger.warn(`  ! no inventory item for SKU ${sku} — skipping stock.`)
      continue
    }
    const hasLevel = (item.location_levels ?? []).some(
      (l: any) => l.location_id === stockLocation.id
    )
    try {
      if (hasLevel) {
        await updateInventoryLevelsWorkflow(container).run({
          input: {
            updates: [
              {
                inventory_item_id: item.id,
                location_id: stockLocation.id,
                stocked_quantity: STOCK_QTY,
              },
            ],
          },
        })
      } else {
        const level: CreateInventoryLevelInput = {
          inventory_item_id: item.id,
          location_id: stockLocation.id,
          stocked_quantity: STOCK_QTY,
        }
        await createInventoryLevelsWorkflow(container).run({
          input: { inventory_levels: [level] },
        })
      }
    } catch (e: any) {
      // Lost the create/update race with the subscriber's qty-0 seed — fall back
      // to an update so the variant still lands at the real quantity.
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [
            {
              inventory_item_id: item.id,
              location_id: stockLocation.id,
              stocked_quantity: STOCK_QTY,
            },
          ],
        },
      })
    }
    logger.info(`  ✓ stocked ${sku} @ ${STOCK_QTY}.`)
  }

  logger.info(
    `Done — seeded ${createdSkus.length} product(s). Now run \`npm run volume:tiers\` to guarantee per-vial discount tiers (the variant-tiers-init subscriber applies them on create, but this re-derives all variants idempotently).`
  )
}
