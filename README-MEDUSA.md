# Longev Biotech — Medusa Commerce Backend

This is the new **Medusa v2** backend that will run your store's professional back office
(orders, fulfillment, inventory, returns) and process payments through **your own
high-risk merchant account** via a custom NMI provider.

It replaces the hand-built `api/*.js` + Supabase commerce logic in the parent folder.
Your compliance features (RUO attestation gate, per-lot Certificate of Analysis, age gate)
are re-implemented here as Medusa modules in the next build stage.

---

## Architecture

```
Storefront (Next.js, rebranded Medusa starter, hosted on Vercel)
        │  Medusa Store API + Collect.js (card tokenization)
        ▼
Medusa backend (this app, hosted on Medusa Cloud)
        ├── Admin dashboard  → orders, fulfillment, inventory, returns, products
        ├── Payment module    → custom NMI provider (src/modules/nmi)
        ├── RUO module        → attestation audit trail   (next stage)
        ├── Lot/CoA module    → per-lot purity + signed CoA links (next stage)
        └── Postgres + Redis  → provisioned by Medusa Cloud
        ▲
NMI gateway  →  YOUR high-risk merchant account (the MID that holds card revenue)
```

Cards are tokenized in the browser by **NMI Collect.js**, so the backend only ever
receives a one-time `payment_token` — never a card number. PCI scope stays at SAQ A.

---

## Before this can take live payments (longest lead — start now)

1. **High-risk merchant account + NMI gateway.** Apply through a high-risk provider
   (PaymentCloud, AllayPay, Payfirmly, etc.). They underwrite the MID and issue NMI
   gateway credentials.
2. **LegitScript certification.** Visa/Mastercard require it for this category. It gates
   approval and has a multi-week lead time. Begin it in parallel.
3. While those process, you can build and test everything against the **NMI gateway
   emulator** (sandbox) — no live MID required.

> Not legal advice. Have your Terms of Sale and RUO policy reviewed by counsel familiar
> with FDA/FTC rules for research chemicals before launch.

---

## What's in this folder now

> **Source of truth for current status is the root `../README.md`** (the project map —
> "what's live, where we left off"). This file is backend-scoped reference.

| Path | Purpose |
|---|---|
| `medusa-config.ts` | App config; registers NMI (conditional), the S3/R2 File module (when `S3_BUCKET` set), and the 25 MB admin upload cap. |
| `src/modules/nmi/` | Custom NMI payment provider — auth / capture / refund / void / webhook (still a placeholder processor). |
| `src/modules/ruo-attestation/` | Immutable RUO affirmation record linked to each order. |
| `src/modules/lot-coa/` | Product lots + signed Certificate-of-Analysis serving (`/store/lots/:lot/coa`). |
| `src/modules/referral/` | **Affiliate/referral program (no payouts).** Tables `affiliate {customer_id, code}` + `referral_order {code, affiliate_customer_id, order_id, order_total}`. Own queryable tables (NOT order.metadata JSONB). Migration `Migration20260613225050.ts`. |
| `src/api/middlewares.ts` | Requires `authenticate("customer")` on `/store/affiliate`. |
| `src/api/store/affiliate/route.ts` | `POST` = mint a code (instant self-serve, idempotent `LB-XXXXXX`); `GET` = code + referred-order count + revenue. |
| `src/api/store/carts/[id]/ruo-complete/route.ts` | RUO gate + **referral attribution**: reads `referral_code`, re-reads the order via the Query graph (the workflow result is only `{id}`), guards self-referral, writes a `referral_order` + stamps `order.metadata.referral_code`. Best-effort (try/catch) so it never fails an order. |
| `src/subscribers/order-placed.ts` | Order hook (email/Slack — wiring TBD; this is C2/S3). |
| `src/subscribers/product-revalidate.ts` | On product/variant change, pings the storefront `/api/revalidate` (LIVE). |
| `src/scripts/seed.ts` | Self-contained seed: BPC-157 + GLP-1 catalog, US/USD region, sample lot. |
| `src/scripts/upload-coa.ts` | `npm run coa:upload -- <lot> <file>` — upload a CoA + set `coa_file_id`. |
| `.env.template` | Required environment variables (copy to `.env`). |
| `package.json` / `tsconfig.json` | Medusa v2.15.5 project setup. |

### Still to build / open
- **Order notifications + welcome email (C2 / S3 — next up)** — wire a Resend notification
  provider; send a welcome email on customer register (S3) and buyer/ops emails on order placed
  (`order-placed.ts`). This is the next planned slice.
- **Real payments (C1)** — choose a high-risk processor; swap or remove the NMI placeholder.
  Affiliate payouts depend on this (the referral module tracks orders but computes no commission).
- **Per-lot CoA viewer** — upload the real CoA for `BPC157-2406-A` (`npm run coa:upload`; file
  still in the old Supabase `coa` bucket) + add a `GET /store/products/:id/lots` endpoint.
- (Done & live: ruo-attestation, lot-coa, **referral/affiliate**, seed, R2 storage, on-publish
  revalidation, storefront, sign-in-for-pricing gate.)

---

## Run locally (a dev machine with Node 20+ and Postgres)

> This cannot run in the Cowork sandbox — Medusa is a long-running server with its own
> Postgres. Use your Mac or a dev box.

```bash
cd medusa-backend
cp .env.template .env          # fill in DATABASE_URL + secrets
npm install
npm run db:migrate
npm run dev                    # admin at http://localhost:9000/app
```

Create an admin user:
```bash
npx medusa user -e you@longevbiotech.com -p yourpassword
```

## Deploy to Medusa Cloud

1. Push this `medusa-backend` folder to a Git repo (e.g. your existing
   `github.com/kikcam-cmd/Longev-Biotech`, which is currently empty).
2. In **Medusa Cloud** → create a project → connect that repo, set the root to
   `medusa-backend`. Cloud provisions Postgres + Redis and injects `DATABASE_URL` /
   `REDIS_URL` automatically.
3. Add the rest of `.env.template` as project environment variables — including
   `NMI_SECURITY_KEY` (use the **emulator** key first), `JWT_SECRET`, `COOKIE_SECRET`,
   and your `*_CORS` origins.
4. Deploy. Then **Settings → Regions → United States → Payment Providers** and enable
   **NMI**.

## Verify the payment provider
- Place a sandbox order from the storefront; confirm an `auth` appears in the NMI portal.
- Mark the order captured in Medusa Admin; confirm the `capture` in NMI.
- Issue a partial refund from Admin; confirm the `refund` in NMI.
