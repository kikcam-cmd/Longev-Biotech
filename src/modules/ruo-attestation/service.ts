import { MedusaService } from "@medusajs/framework/utils"
import RuoAttestation from "./models/ruo-attestation"

/**
 * Generates CRUD methods: createRuoAttestations, listRuoAttestations,
 * retrieveRuoAttestation, updateRuoAttestations, deleteRuoAttestations.
 */
class RuoAttestationModuleService extends MedusaService({
  RuoAttestation,
}) {}

export default RuoAttestationModuleService
