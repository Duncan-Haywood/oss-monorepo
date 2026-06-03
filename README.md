# Retail Pilot Intel

Privacy-first retail analytics for small-format pilot stores (initial target: ~10 m² leather boutique, Italy).

**Stack:** TypeScript monorepo (pnpm), TSX documentation site, Node 22+ with built-in SQLite.

## Documentation (TSX)

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173
pnpm docs:build    # → apps/docs/dist
pnpm portal:dev    # http://localhost:5174 — sales demo portal
pnpm portal:build  # → apps/portal/dist
```

### Sales / marketing demo walkthrough

1. Run `pnpm portal:dev` and open http://localhost:5174
2. Passcode: `atelier-demo` (or set `VITE_DEMO_PASSCODE`)
3. Sign in as **Owner** to see the ROI banner on Overview
4. Tour order for stakeholders: **Business value** → **Overview** → **Products** (SKU gap) → **Experiments** → **Trust** (privacy gate)

Built docs are verified in CI and published to **private GitHub Pages** on every push to `main` (see [Hosting docs](#hosting-docs-private)).

## Hosting docs (private)

The TSX docs site is a static Vite build (`apps/docs/dist`) with hash-based routing — no server rewrites required.

### GitHub Pages (recommended, repo-private)

1. **Settings → Pages → Build and deployment:** set **Source** to **GitHub Actions**.
2. **Settings → Pages → Visibility:** set **Private** (requires GitHub Pro, Team, or Enterprise on the account/org).
3. Push to `main` — workflow `.github/workflows/docs-pages.yml` builds and deploys automatically.
4. Open the URL shown under **Settings → Pages** or the `github-pages` environment on the latest workflow run.

Only people with access to this repository can view private Pages. No extra passwords or third-party accounts.

### Vercel (optional — external stakeholders)

Use a separate Vercel project when you need a shareable URL with **Deployment Protection** (password or Vercel Authentication) for people who do not have GitHub access:

1. Import this repo in Vercel; use the settings in `vercel.docs.json` (install/build/output).
2. Enable **Deployment Protection → Password** (or Vercel Authentication) on the project.
3. Store the password in your team password manager — do not rely on client-side env vars for confidentiality.

### Local / LAN preview

```bash
pnpm docs:build
docker compose up docs   # http://localhost:8080
```

CI also uploads `apps/docs/dist` as a downloadable artifact on every run.

## Quick start

```bash
pnpm install
pnpm bootstrap     # sample edge + POS events → SQLite + report
pnpm run ci        # typecheck, lint, build, bootstrap smoke test
```

## Repository layout

```
apps/docs/              TSX documentation site (Vite/React)
apps/portal/            Secure sales demo portal (illustrative data)
packages/schemas/       Event types + JSON Schema
packages/edge/          On-device vision (stub CLI)
packages/pos/           POS connector (stub CLI)
packages/analytics/     SQLite rollups & reports
scripts/ci.ts           TypeScript CI orchestrator
.github/workflows/      GitHub Actions
```

## What to build first (ROI)

For the Italy leather boutique pilot, delivery order follows **profit impact per euro of build**, not sensor count. **Start at ranks 1–3** (door+POS, desirability gap, upsell) — they typically pay back a Core subscription with one extra sale/month at pilot AOV.

1. **Door + POS join** — conversion % and revenue per entrant (ranks 1, 4, 5)
2. **SKU desirability gap + upsell** — margin, cash recovery, and AOV (ranks 2–3)
3. **Experiments** — measurable € lift per change (rank 6)
4. **Window / outdoor funnel** — only after in-store baseline is trusted (rank 8)

Full matrix with scores, monthly € math, and payback: `pnpm docs:dev` → **ROI & priorities** (`/roi`).

**Business plan** (market, pricing, GTM, unit economics): `pnpm docs:dev` → **Business plan** (`/business-plan`).

## Phase 1 (technical)

- Indoor door camera → aggregate counts (no identity)
- POS ingest → normalized `SaleEvent`
- Join funnel → conversion and revenue-per-entry KPIs

## License

Private repository — all rights reserved unless otherwise agreed with store operators.
