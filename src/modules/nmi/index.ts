import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import NmiPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [NmiPaymentProviderService],
})
