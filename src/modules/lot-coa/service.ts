import { MedusaService } from "@medusajs/framework/utils"
import Lot from "./models/lot"

/**
 * Generates: createLots, listLots, retrieveLot, updateLots, deleteLots.
 */
class LotCoaModuleService extends MedusaService({
  Lot,
}) {}

export default LotCoaModuleService
