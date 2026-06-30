# Local Site Studio

Pre-built websites for local businesses — preview before you buy, $500 flat.

Local Site Studio is a productized web agency: discover local businesses, generate branded preview sites, outreach via email with a preview link, and convert with Stripe checkout. This repository contains the marketing site, operator dashboard scaffold, preview templates, and project documentation.

## Quick start

```bash
npm install
cp .env.example .env.local
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
| `POST /api/stripe/checkout` | Checkout session stub (returns 501) |

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) — data ingestion, site generation, preview hosting, outreach, payments
- [Business model](./docs/BUSINESS-MODEL.md) — pricing, funnel, outreach scripts
- [Compliance](./docs/COMPLIANCE.md) — scraping ToS, CAN-SPAM, GDPR, data retention
- [Roadmap](./docs/ROADMAP.md) — phased implementation plan

## Business model (summary)

1. Gather public business info (APIs and manual research — see compliance notes).
2. Pre-build a website from templates.
3. Email the owner a preview link on a trustworthy subdomain.
4. Optional discovery call to refine the site.
5. Collect $500 via Stripe; deploy to custom domain.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- **Vercel** (hosting)
- **Stripe** (payments — to be integrated)
- Database TBD (see roadmap)

## Environment variables

Copy `.env.example` to `.env.local`. Never commit secrets.

Key variables: `STRIPE_*`, `RESEND_API_KEY`, `VERCEL_*`, `NEXT_PUBLIC_PREVIEW_DOMAIN`.

## Compliance reminder

Do **not** implement scrapers against Google Maps or Facebook without reviewing platform ToS and obtaining legal advice. Prefer Google Places API, licensed data, or manual research. See [docs/COMPLIANCE.md](./docs/COMPLIANCE.md).

## Deploy

```bash
npm run build
```

Deploy to Vercel and connect your production domain. Configure wildcard DNS for preview subdomains when ready.

## License

Private — all rights reserved.
