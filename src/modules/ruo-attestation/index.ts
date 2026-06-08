import { Module } from "@medusajs/framework/utils"
import RuoAttestationModuleService from "./service"

export const RUO_ATTESTATION_MODULE = "ruo_attestation"

export default Module(RUO_ATTESTATION_MODULE, {
  service: RuoAttestationModuleService,
})
