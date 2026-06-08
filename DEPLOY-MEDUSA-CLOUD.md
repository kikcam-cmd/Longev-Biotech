# Deploy the Longev Medusa backend to Medusa Cloud

> **Why not Vercel:** Medusa is a long-running Node server that needs Postgres + Redis.
> Vercel can only serve static/serverless output, so `medusa build` succeeds but the
> deploy then fails with `No Output Directory named "public"`. That is exactly what was
> happening on the `longev-biotech` Vercel project. Medusa goes to Medusa Cloud; **only
> the future Next.js storefront goes to Vercel.**

Repo: `github.com/kikcam-cmd/Longev-Biotech` (this `medusa-backend` is the repo root).

---

## STEP 0 — Protect the fallback first (Vercel dashboard)
The static site is still live (production alias = last good static deploy). But the
`longev-biotech` Vercel project's **Git is currently wired to this Medusa repo**, so every
push fires a doomed build.

1. Vercel → project **`longev-biotech`** → **Settings → Git → Disconnect**.
2. Confirm the production URL still serves the static site.

This leaves the static site deployable separately later and stops the failing builds.
**Do not delete the project** — it is your rollback.

---

## STEP 1 — Create the Cloud project
1. Sign in at **cloud.medusajs.com** → create an organization/project.
2. **Connect GitHub** → select `kikcam-cmd/Longev-Biotech`, branch `master`,
   **root directory = repository root** (the repo *is* the backend — no subfolder).
3. Cloud provisions **Postgres + Redis** and injects `DATABASE_URL` / `REDIS_URL` /
   `PORT` / worker-mode automatically — **do not set those yourself.**

## STEP 2 — Set environment variables (Cloud → Environment Variables)
Set only the vars you own (see `.env.template`):

| Var | Value |
|---|---|
| `JWT_SECRET` | long random string (`openssl rand -base64 32`) |
| `COOKIE_SECRET` | long random string |
| `STORE_CORS` | `http://localhost:8000` (+ storefront domain later) |
| `ADMIN_CORS` | your Cloud app URL |
| `AUTH_CORS` | storefront + admin origins, comma-separated |
| `NMI_SECURITY_KEY` | `placeholder` — any non-empty value (NMI is a stub; this only unblocks boot) |

> If Cloud offers `MEDUSA_BACKEND_URL`, let it set that; don't fight it.

## STEP 3 — Deploy
Push (or trigger a deploy). Migrations run via the `predeploy` script
(`medusa db:migrate`) before start. Watch the deploy log for a clean boot.

## STEP 4 — Verify boot
- `https://<cloud-app-url>/health` → returns OK.
- `https://<cloud-app-url>/app` → Medusa Admin login screen loads.

## STEP 5 — Create an admin user
Run on the deployed backend (Cloud console / one-off command):
```bash
npx medusa user -e you@longevbiotech.com -p <a-strong-password>
```
Log into `/app`.

## STEP 6 — Seed the catalog
The seed is **self-contained** (it creates the store currency, sales channel, US/USD
region, tax region, stock location, fulfillment + shipping, a publishable API key, the
BPC-157 + GLP-1 products, inventory, and a sample lot). There is **no** `medusa db:seed`
in v2 — ignore any older docs that say otherwise.

> **Run once on a clean DB.** The seed is not idempotent — if it fails partway, reset the
> database (or delete the partial records) before re-running, or it will throw on duplicates.
```bash
npm run seed
```
After seeding, sanity-check in **Admin → Settings → Store** that **USD** is the store
currency before trusting checkout.
**Copy the PUBLISHABLE API KEY printed at the end** → it becomes the storefront's
`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`. (Also visible in Admin → Settings → Publishable API Keys.)

## STEP 7 — Confirm the Store API
```bash
curl -H "x-publishable-api-key: <key>" \
  "https://<cloud-app-url>/store/products"
```
Should return BPC-157 + GLP-1.

---

## After this milestone
Backend is hosted, booting, admin-reachable, catalog seeded. **Next milestone = the
Next.js storefront** (scaffold the Medusa starter, rebrand to 1:1 with the static site,
drop in `AgeGate` + `NmiRuoCheckout`, point at this backend + the publishable key). Then
deploy the storefront to a **new** Vercel project — not `longev-biotech` — and only
repoint `longevbiotech.com` once it is proven.

## Known follow-ups (don't block boot)
- **CoA signed URLs:** enable the S3 File provider in `medusa-config.ts` and set
  `coa_file_id` on lots (currently the File module is the default local provider).
- **Payments:** choose a real high-risk processor; swap or remove the NMI placeholder.
- **Order emails / Slack:** `src/subscribers/order-placed.ts` only logs today.

_Not legal advice. Terms of sale + RUO policy need counsel review (FDA/FTC research-chemical rules) before taking real orders._
