import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { LOT_COA_MODULE } from "../modules/lot-coa"

/**
 * Dedicated workflow to set the store's supported currencies. The default
 * starter does this through `updateStoresStep` (not `updateStoresWorkflow`)
 * specifically because that is the path that reliably persists currencies.
 */
const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[]
    store_id: string
  }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((c) => ({
          currency_code: c.currency_code,
          is_default: c.is_default ?? false,
        })),
      },
    }))
    const stores = updateStoresStep(normalizedInput)
    return new WorkflowResponse(stores)
  }
)

const PRODUCT_DEFS = (salesChannelId: string, shippingProfileId: string) => [
  {
    title: "BPC-157",
    subtitle: "Body Protection Compound-157",
    handle: "bpc-157",
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
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
        prices: [{ amount: 99, currency_code: "usd" }], // $99.00 placeholder (v2 = major units)
      },
    ],
  },
  {
    title: "GLP-1",
    subtitle: "Research Peptide",
    handle: "glp-1",
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
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
        prices: [{ amount: 189, currency_code: "usd" }], // $189.00 placeholder (v2 = major units)
      },
    ],
  },
]

/**
 * Self-contained, IDEMPOTENT seed for Longev Biotech (US / USD).
 *
 * There is no separate "base seed" command in Medusa v2 (`medusa db:seed` does
 * not exist), so this creates everything a fresh database needs. Every step
 * checks for existing data first, so it is safe to re-run (e.g. to recover from
 * a partial run, or after adding a product).
 *
 * Order: store currency (USD) → sales channel → region (US/USD) → tax region →
 * stock location → fulfillment set + shipping options → link SC↔location →
 * publishable API key (+ link to SC) → products → inventory levels → lot.
 *
 *   npm run seed
 *
 * Prints the PUBLISHABLE API KEY at the end → storefront NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.
 */
export default async function seedLongev({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const storeModuleService = container.resolve(Modules.STORE)

  // link.create throws if the link already exists; ignore that on re-runs.
  const safeLink = async (def: any) => {
    try {
      await link.create(def)
    } catch (e: any) {
      logger.info(`Link already exists, skipping: ${e?.message ?? e}`)
    }
  }

  const countries = ["us"]

  logger.info("Seeding store + sales channel…")
  const [store] = await storeModuleService.listStores()
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!defaultSalesChannel.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    })
    defaultSalesChannel = result
  }
  const salesChannelId = defaultSalesChannel[0].id

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [{ currency_code: "usd", is_default: true }],
    },
  })
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_sales_channel_id: salesChannelId },
    },
  })

  logger.info("Seeding region (United States / USD)…")
  let region: any
  const { data: existingRegions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: { name: "United States" },
  })
  if (existingRegions?.length) {
    region = existingRegions[0]
  } else {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "United States",
            currency_code: "usd",
            countries,
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    region = result[0]
  }

  logger.info("Seeding tax region…")
  const { data: existingTax } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
    filters: { country_code: "us" },
  })
  if (!existingTax?.length) {
    await createTaxRegionsWorkflow(container).run({
      input: countries.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    })
  }

  logger.info("Seeding stock location…")
  let stockLocation: any
  const { data: existingLoc } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: "US Warehouse" },
  })
  if (existingLoc?.length) {
    stockLocation = existingLoc[0]
  } else {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "US Warehouse",
            address: { city: "Los Angeles", country_code: "US", address_1: "" },
          },
        ],
      },
    })
    stockLocation = result[0]
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_location_id: stockLocation.id },
    },
  })

  // Manual fulfillment provider for the location.
  await safeLink({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  logger.info("Seeding fulfillment + shipping options…")
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  })
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
    shippingProfile = result[0]
  }

  // Reuse an existing fulfillment set by name, else create one.
  let fulfillmentSet: any
  const { data: existingSets } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "name", "service_zones.id"],
    filters: { name: "US Warehouse delivery" },
  })
  if (existingSets?.length) {
    fulfillmentSet = existingSets[0]
  } else {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "US Warehouse delivery",
      type: "shipping",
      service_zones: [
        {
          name: "United States",
          geo_zones: [{ country_code: "us", type: "country" }],
        },
      ],
    })
    await safeLink({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    })
  }
  const serviceZoneId = fulfillmentSet.service_zones[0].id

  // Create shipping options only if none exist yet.
  const { data: existingShipping } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  if (!existingShipping?.length) {
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Standard Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: serviceZoneId,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Standard",
            description: "Ships in 2-3 business days.",
            code: "standard",
          },
          prices: [
            { currency_code: "usd", amount: 10 },
            { region_id: region.id, amount: 10 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
        {
          name: "Express Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: serviceZoneId,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Express",
            description: "Ships in 24 hours.",
            code: "express",
          },
          prices: [
            { currency_code: "usd", amount: 25 },
            { region_id: region.id, amount: 25 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    })
  }

  try {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [salesChannelId] },
    })
  } catch (e: any) {
    logger.info(`SC↔location link exists, skipping: ${e?.message ?? e}`)
  }

  logger.info("Seeding publishable API key…")
  let publishableApiKey: { id: string; token?: string } | undefined
  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "token"],
    filters: { type: "publishable" },
  })
  publishableApiKey = existingKeys?.[0]
  if (!publishableApiKey) {
    const {
      result: [created],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{ title: "Storefront", type: "publishable", created_by: "" }],
      },
    })
    publishableApiKey = created as { id: string; token?: string }
  }
  try {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: publishableApiKey.id, add: [salesChannelId] },
    })
  } catch (e: any) {
    logger.info(`key↔SC link exists, skipping: ${e?.message ?? e}`)
  }

  logger.info("Seeding Longev Biotech catalog…")
  const defs = PRODUCT_DEFS(salesChannelId, shippingProfile.id)
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: defs.map((d) => d.handle) },
  })
  const existingHandles = new Set((existingProducts ?? []).map((p: any) => p.handle))
  const toCreate = defs.filter((d) => !existingHandles.has(d.handle))
  let products: any[] = existingProducts ?? []
  if (toCreate.length) {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: toCreate },
    })
    products = [...products, ...result]
    logger.info(`Created ${result.length} product(s).`)
  } else {
    logger.info("Products already exist, skipping.")
  }

  logger.info("Seeding inventory levels…")
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "location_levels.location_id"],
  })
  const inventoryLevels: CreateInventoryLevelInput[] = (inventoryItems ?? [])
    .filter(
      (item: any) =>
        !item.location_levels?.some(
          (l: any) => l.location_id === stockLocation.id
        )
    )
    .map((item: { id: string }) => ({
      location_id: stockLocation.id,
      stocked_quantity: 100000,
      inventory_item_id: item.id,
    }))
  if (inventoryLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    })
    logger.info(`Created ${inventoryLevels.length} inventory level(s).`)
  }

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
    } else {
      logger.info("Lot BPC157-2406-A already exists, skipping.")
    }
  }

  logger.info("Longev seed complete.")
  logger.info(
    `PUBLISHABLE API KEY (storefront NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY): ${
      publishableApiKey.token ??
      "(already existed — copy from Admin → Settings → Publishable API Keys)"
    }`
  )
}
