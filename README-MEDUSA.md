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

| Path | Purpose |
|---|---|
| `medusa-config.ts` | App config; registers the NMI payment provider. |
| `src/modules/nmi/service.ts` | Custom NMI provider — auth / capture / refund / void / webhook. |
| `src/modules/nmi/index.ts` | Registers the provider with Medusa's Payment module. |
| `.env.template` | Required environment variables (copy to `.env`). |
| `package.json` / `tsconfig.json` | Medusa v2.15.5 project setup. |

### Still to build (tracked stages)
- `src/modules/ruo-attestation` — immutable RUO affirmation record linked to each order.
- `src/modules/lot-coa` — product lots + signed Certificate-of-Analysis downloads.
- `src/subscribers/order-placed.ts` — order/shipping email + Slack notification.
- `src/scripts/seed.ts` — seed BPC-157 + GLP-1 catalog and regions.
- Admin widgets — view RUO attestation + CoA on the order/product pages.
- Storefront — rebranded Next.js starter wired to this backend.

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
