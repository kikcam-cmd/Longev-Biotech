import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Safety net: when a variant is created (incl. via the stock Admin "Create"
 * button, which does NOT stock it), auto-create a US-Warehouse inventory level
 * at qty 0 — so it shows "0 available at 1 location" (quantity editable inline)
 * instead of "0 available at 0 locations" (stuck: no level to edit).
 *
 * Idempotent: skips a variant that already has a US-Warehouse level — so it never
 * collides with the `add-size` route (which sets a real quantity on the same level).
 */
const WAREHOUSE = "US Warehouse"

export default async function variantStockInit({
  event,
  container,
}: SubscriberArgs<{ id?: string; ids?: string[] }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const data: any = event.data
  const variantIds: string[] = Array.isArray(data)
    ? data.map((d: any) => d?.id).filter(Boolean)
    : data?.ids ?? (data?.id ? [data.id] : [])
  if (!variantIds.length) return

  const { data: locs } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: WAREHOUSE },
  })
  const location = locs?.[0]
  if (!location) {
    logger.warn(`[variant-stock-init] no "${WAREHOUSE}" stock location — skipping.`)
    return
  }

  for (const variantId of variantIds) {
    try {
      const { data: vs } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "manage_inventory"],
        filters: { id: variantId },
      })
      const variant: any = vs?.[0]
      if (!variant?.manage_inventory || !variant.sku) continue

      // Variant SKU == its inventory item's SKU (Medusa sets them equal on create).
      const { data: items } = await query.graph({
        entity: "inventory_item",
        fields: ["id", "location_levels.location_id"],
        filters: { sku: variant.sku },
      })
      const item: any = items?.[0]
      if (!item?.id) continue

      const alreadyStocked = (item.location_levels ?? []).some(
        (l: any) => l.location_id === location.id
      )
      if (alreadyStocked) continue

      await createInventoryLevelsWorkflow(container).run({
        input: {
          inventory_levels: [
            { inventory_item_id: item.id, location_id: location.id, stocked_quantity: 0 },
          ],
        },
      })
      logger.info(
        `[variant-stock-init] seeded ${WAREHOUSE} level (qty 0) for variant ${variantId} (${variant.sku})`
      )
    } catch (e: any) {
      logger.warn(`[variant-stock-init] ${variantId}: ${e?.message ?? e}`)
    }
  }
}

export const config: SubscriberConfig = {
  event: "product-variant.created",
}
