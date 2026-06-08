import { Module } from "@medusajs/framework/utils"
import LotCoaModuleService from "./service"

export const LOT_COA_MODULE = "lot_coa"

export default Module(LOT_COA_MODULE, {
  service: LotCoaModuleService,
})
