import { MedusaService } from "@medusajs/framework/utils"
import Affiliate from "./models/affiliate"
import ReferralOrder from "./models/referral-order"

/**
 * Generates CRUD methods for both models, e.g.:
 *   createAffiliates / listAffiliates / retrieveAffiliate / updateAffiliates
 *   createReferralOrders / listReferralOrders / ...
 */
class ReferralModuleService extends MedusaService({
  Affiliate,
  ReferralOrder,
}) {}

export default ReferralModuleService
