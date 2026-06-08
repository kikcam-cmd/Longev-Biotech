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

/**
 * Self-contained seed for Longev Biotech (US / USD).
 *
 * This creates EVERYTHING a fresh Medusa Cloud database needs — there is no
 * separate "base seed" command in Medusa v2 (`medusa db:seed` does not exist).
 *
 * RUN ONCE on a CLEAN database. It is NOT idempotent: sales channel / shipping
 * profile / publishable key are guarded, but region, tax region, stock location,
 * fulfillment set, products, and inventory are not — a re-run will throw on
 * duplicates (e.g. duplicate product handle or tax region). If a run fails
 * partway, reset the DB (or delete the partial records) before re-seeding.
 *
 * Order of operations (each depends on the previous):
 *   store currencies (USD) → sales channel → region (US/USD) → tax region →
 *   stock location → fulfillment set + shipping options → link SC↔location →
 *   publishable API key (+ link to SC) → products → inventory levels → lot.
 *
 * Run once after the backend is deployed and migrated:
 *   npm run seed
 *
 * At the end it prints the PUBLISHABLE API KEY — copy it into the storefront's
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.
 */
export default async function seedLongev({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const storeModuleService = container.resolve(Modules.STORE)

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

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [{ currency_code: "usd", is_default: true }],
    },
  })

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_sales_channel_id: defaultSalesChannel[0].id },
    },
  })

  logger.info("Seeding region (United States / USD)…")
  const { result: regionResult } = await createRegionsWorkflow(container).run({
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
  const region = regionResult[0]

  logger.info("Seeding tax region…")
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  })

  logger.info("Seeding stock location…")
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "US Warehouse",
          address: { city: "Los Angeles", country_code: "US", address_1: "" },
        },
      ],
    },
  })
  const stockLocation = stockLocationResult[0]

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_location_id: stockLocation.id },
    },
  })

  // Manual fulfillment provider for the location.
  await link.create({
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

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "US Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "United States",
        geo_zones: [{ country_code: "us", type: "country" }],
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Ships in 2-3 business days.",
          code: "standard",
        },
        prices: [
          { currency_code: "usd", amount: 1000 },
          { region_id: region.id, amount: 1000 },
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
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Ships in 24 hours.",
          code: "express",
        },
        prices: [
          { currency_code: "usd", amount: 2500 },
          { region_id: region.id, amount: 2500 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [defaultSalesChannel[0].id] },
  })

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

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [defaultSalesChannel[0].id] },
  })

  logger.info("Seeding Longev Biotech catalog…")
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "BPC-157",
          subtitle: "Body Protection Compound-157",
          handle: "bpc-157",
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          description:
            "BPC-157 is a synthetic peptide derived from a protective protein found in human gastric juice. It is widely studied in research settings for its potential role in tissue repair mechanisms, wound healing pathways, gastrointestinal integrity, tendon and ligament research, and inflammation-related signaling processes. Each production lot is analytically verified using HPLC-UV-MS to confirm molecular identity and purity, and is supplied strictly for laboratory research use.",
          sales_channels: [{ id: defaultSalesChannel[0].id }],
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
              prices: [{ amount: 9900, currency_code: "usd" }], // $99.00 placeholder
            },
          ],
        },
        {
          title: "GLP-1",
          subtitle: "Research Peptide",
          handle: "glp-1",
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          description:
            "A high-purity, lyophilized research peptide supplied in 30 mg vials. Every production lot is analytically verified by HPLC-UV-MS to confirm molecular identity and purity. Intended strictly for laboratory research and analytical applications.",
          sales_channels: [{ id: defaultSalesChannel[0].id }],
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

  logger.info("Seeding inventory levels…")
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  })
  const inventoryLevels: CreateInventoryLevelInput[] = inventoryItems.map(
    (item: { id: string }) => ({
      location_id: stockLocation.id,
      stocked_quantity: 100000,
      inventory_item_id: item.id,
    })
  )
  if (inventoryLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    })
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
    }
  }

  logger.info("Longev seed complete.")
  logger.info(
    `PUBLISHABLE API KEY (for storefront NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY): ${
      publishableApiKey.token ?? "(already existed — copy from Admin → Settings → Publishable API Keys)"
    }`
  )
}
