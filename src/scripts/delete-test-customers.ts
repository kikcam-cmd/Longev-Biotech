import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * One-off cleanup: delete the throwaway customers created during the
 * authed-buy-box eyeball (2026-06-14). They all use the unique alias pattern
 * `kikuchicameron+eb<timestamp>@gmail.com`, so matching on that prefix targets
 * exactly the eyeball accounts and nothing real.
 *
 *   npm run customers:delete-test          # dry-run (lists matches only)
 *   npm run customers:delete-test -- apply # actually delete
 *
 * NOTE: the trigger is a bare `apply` token, not `--apply` — `medusa exec`
 * intercepts `--`-prefixed flags before they reach the script.
 */
const PREFIX = "kikuchicameron+eb"

export default async function deleteTestCustomers({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const customerService = container.resolve(Modules.CUSTOMER)
  const apply = (args ?? []).includes("apply")

  // Pull customers and filter by the eyeball alias prefix.
  const customers = await customerService.listCustomers(
    {},
    { select: ["id", "email", "created_at"], take: 1000 }
  )
  const matches = customers.filter((c: any) =>
    (c.email ?? "").startsWith(PREFIX)
  )

  if (!matches.length) {
    logger.info(`No customers match "${PREFIX}*" — nothing to delete.`)
    return
  }

  logger.info(`Found ${matches.length} test customer(s):`)
  for (const c of matches) logger.info(`  • ${c.email} (${c.id})`)

  if (!apply) {
    logger.info("DRY RUN — re-run with `-- apply` to delete these.")
    return
  }

  await customerService.deleteCustomers(matches.map((c: any) => c.id))
  logger.info(`Deleted ${matches.length} test customer(s).`)
}
