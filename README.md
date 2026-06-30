# Local Site Studio

**Operated by Maris Stella Labs · Colorado, USA**

Pre-built websites for local businesses — preview before you buy, $500 flat, zero sales calls.

Local Site Studio is an automated website service from **Maris Stella Labs**: discover local businesses, generate preview sites, outreach via email and AI voice agents, and convert with self-serve Stripe checkout. All payments and legal obligations are under Maris Stella Labs.

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
| `/` | Service landing — $500 pre-built website offer |
| `/privacy` | Privacy Policy placeholder |
| `/terms` | Terms of Service placeholder |
| `/dashboard` | Operator monitoring console (placeholder) |
| `/dashboard/leads` | Automated funnel stages (placeholder) |
| `/preview/[slug]` | Client preview site + self-serve checkout CTA |
| `/checkout` | Stripe checkout UI (not connected) |
| `/docs` | Documentation index |
| `POST /api/stripe/checkout` | Checkout session stub (501) |

## Documentation

- [Legal](./docs/LEGAL.md) — entity, Terms/Privacy outlines, CAN-SPAM, Stripe, voice disclosures
- [Architecture](./docs/ARCHITECTURE.md) — automated funnel, voice agents, zero-touch operator
- [Business model](./docs/BUSINESS-MODEL.md) — pricing, automated funnel
- [Compliance](./docs/COMPLIANCE.md) — CAN-SPAM, TCPA, Colorado CPA, scraping ToS
- [Roadmap](./docs/ROADMAP.md) — phased implementation plan

## Business model (summary)

1. Ingest public business data (Places API, licensed data — not UI scrapers).
2. Auto-generate preview site from templates.
3. Email from **Maris Stella Labs** with preview link (+ optional AI voice).
4. Customer self-serves via preview checkout or AI voice assistant.
5. Stripe payment to **Maris Stella Labs** → automated deploy.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- **Vercel** (hosting)
- **Stripe** (payments — merchant: Maris Stella Labs)
- Database TBD (see roadmap)

## Environment variables

Copy `.env.example` to `.env.local`. Never commit secrets.

Key branding: `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_COMPANY_ADDRESS`, `NEXT_PUBLIC_APP_NAME`.

Key integrations: `STRIPE_*`, `RESEND_*`, `VERCEL_*`.

## Compliance reminder

- Outreach emails must identify **Maris Stella Labs** and include a valid Colorado postal address (CAN-SPAM).
- Do not launch outbound AI voice to cell phones without TCPA legal review. See [docs/COMPLIANCE.md](./docs/COMPLIANCE.md) and [docs/LEGAL.md](./docs/LEGAL.md).

## Deploy

```bash
npm run build
```

Deploy to Vercel; configure wildcard DNS for preview subdomains.

## License

Private — Maris Stella Labs. All rights reserved.
