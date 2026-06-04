# Documentation

**Commercial viability report** (standalone HTML): [`commercial-viability-report.html`](./commercial-viability-report.html) — market fit, profitability, scalability, technical gaps, risks, and prioritized recommendations.

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

Key pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan` — market, pricing, GTM, design partner terms, payback model, partners, CS), **Roadmap** (`/roadmap`).

Planning starts at **Business value & ROI** (`/roi`) — ranks 1–3 first (door+POS, desirability gap, upsell), then weighted score, build cost, payback, and monthly/annual € scenarios for the Italy leather boutique pilot. **Roadmap** maps milestones M1–M5+ to that order.

```bash
pnpm docs:dev
pnpm docs:ingest  # copy docs/*.html and reports/*.html into the Vite app
pnpm docs:build   # ingest + output: apps/docs/dist
```

In the built site, open **HTML reports** (`#/reports`) for ingested assessments, or view TSX pages in the nav.

CI builds and uploads `apps/docs/dist` on every push to `main`. **Deploy docs** workflow publishes to GitHub Pages when `main` changes under `apps/docs/`, `docs/`, or `reports/` (requires `DOCS_PASSCODE` secret).
