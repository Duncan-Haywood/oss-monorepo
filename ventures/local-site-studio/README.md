# Local Site Studio

Pre-built websites for local businesses — preview before you buy, $500 flat.

Operated by **Maris Stella Labs** (Colorado, USA). Documentation lives in the app at `/docs` — not markdown files.

## Hosting on AWS: not moved yet, on purpose (2026-11-25)

The portfolio is moving to AWS (task `aws-move-products`). This app's Convex backend was never deployed (no
`CONVEX_DEPLOYMENT`, no deploy workflow), so there is nothing running to move. When this product is chosen to launch, it
is built on the AWS starter directly (a Postgres driver for `src/lib/db.ts` beside the SQLite one) instead of deploying
Convex first. Reasons and scope: `docs/reports/2026-11-25-aws-move-products.md`, "Exception".

## Quick start

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_BRAND_NAME in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) · Docs at [http://localhost:3000/docs](http://localhost:3000/docs)

## Two-layer branding

| Layer | Env var | Used for |
|-------|---------|----------|
| Public brand | `NEXT_PUBLIC_BRAND_NAME` | Marketing, outreach, voice agent |
| Legal entity | `NEXT_PUBLIC_LEGAL_ENTITY` | Stripe, contracts, compliance |

See `/docs/legal` in the running app.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/docs` | Documentation index (TSX pages) |
| `/docs/legal`, `/docs/compliance`, etc. | Operator docs |
| `/preview/[slug]` | Client preview template |
| `/checkout` | Stripe checkout UI (stub) |
| `/dashboard` | Operator console (placeholder) |

## Tech stack

Next.js 16 · TypeScript · Tailwind v4 · Vercel · Stripe

## License

All rights reserved — see [`LICENSE`](LICENSE).
