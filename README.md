# Local Site Studio

Pre-built websites for local businesses — preview before you buy, $500 flat.

This repository contains the marketing site, operator dashboard scaffold, preview templates, and project documentation for a productized web agency operated by **Maris Stella Labs** (Colorado, USA).

## Two-layer branding

| Layer | Config | Example | Used for |
|-------|--------|---------|----------|
| **Public brand** | `NEXT_PUBLIC_BRAND_NAME` | SitePreview *(TBD)* | Landing page, outreach emails, voice agent, preview pages |
| **Legal entity** | `NEXT_PUBLIC_LEGAL_ENTITY` | Maris Stella Labs | Stripe, contracts, Terms/Privacy, CAN-SPAM footers |

The public brand and legal entity are intentionally separate. Marketing leads with the brand customers remember; invoices and compliance identify Maris Stella Labs.

```bash
# .env.local
NEXT_PUBLIC_BRAND_NAME=SitePreview        # customer-facing (choose before launch)
NEXT_PUBLIC_LEGAL_ENTITY=Maris Stella Labs
NEXT_PUBLIC_LEGAL_LOCATION=Colorado, USA
```

Typed constants live in [`src/lib/brand.ts`](./src/lib/brand.ts). If `NEXT_PUBLIC_BRAND_NAME` is unset, the UI shows a **"Your Brand"** placeholder and a dev reminder to configure it.

**Footer pattern:** `© {Brand} · A Maris Stella Labs company · Colorado, USA`

See [docs/LEGAL.md](./docs/LEGAL.md) for DBA/trade name requirements when the public brand differs from the legal entity.

## Quick start

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_BRAND_NAME in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Agency landing — explains the $500 pre-built website offer |
| `/dashboard` | Operator console overview (placeholder) |
| `/dashboard/leads` | Lead pipeline funnel (placeholder) |
| `/preview/[slug]` | Client preview site template |
| `/checkout` | Stripe checkout UI (not connected) |
| `/docs` | Documentation index |
| `/terms` | Terms of Service (placeholder) |
| `/privacy` | Privacy Policy (placeholder) |
| `POST /api/stripe/checkout` | Checkout session stub (returns 501) |

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) — data ingestion, site generation, preview hosting, outreach, payments
- [Business model](./docs/BUSINESS-MODEL.md) — pricing, funnel, outreach scripts
- [Legal](./docs/LEGAL.md) — entity vs brand, CAN-SPAM, Stripe, voice disclosures
- [Voice agent flow](./docs/VOICE-AGENT-FLOW.md) — call scripts (public brand persona)
- [Compliance](./docs/COMPLIANCE.md) — scraping ToS, CAN-SPAM, GDPR, data retention
- [Roadmap](./docs/ROADMAP.md) — phased implementation plan

## Business model (summary)

1. Gather public business info (APIs and manual research — see compliance notes).
2. Pre-build a website from templates.
3. Email the owner a preview link on a trustworthy subdomain (public brand in From name).
4. Optional AI voice call to refine the site (public brand persona).
5. Collect $500 via Stripe (Maris Stella Labs as merchant); deploy to custom domain.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- **Vercel** (hosting)
- **Stripe** (payments — to be integrated)
- Database TBD (see roadmap)

## Environment variables

Copy `.env.example` to `.env.local`. Never commit secrets.

Key variables: `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_LEGAL_ENTITY`, `STRIPE_*`, `RESEND_API_KEY`, `VERCEL_*`, `NEXT_PUBLIC_PREVIEW_DOMAIN`.

## Compliance reminder

Do **not** implement scrapers against Google Maps or Facebook without reviewing platform ToS and obtaining legal advice. Prefer Google Places API, licensed data, or manual research. See [docs/COMPLIANCE.md](./docs/COMPLIANCE.md).

## Deploy

```bash
npm run build
```

Deploy to Vercel and connect your production domain. Configure wildcard DNS for preview subdomains when ready.

## License

Private — all rights reserved.
