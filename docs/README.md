# Documentation

<<<<<<< HEAD
All product documentation lives in **`apps/docs/src/pages/`** as **TSX** (React components).
=======
Product docs live in **`apps/docs`** as TSX pages, built with Vite.

**Commercial viability assessment:** open [`commercial-viability-report.html`](./commercial-viability-report.html) in a browser — deep strategic analysis of market fit, unit economics, scalability, and recommendations.

Key pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan` — market, pricing, GTM, design partner terms, payback model, partners, CS), **Roadmap** (`/roadmap`).

Planning starts at **Business value & ROI** (`/roi`) — ranks 1–3 first (door+POS, desirability gap, upsell), then weighted score, build cost, payback, and monthly/annual € scenarios for the Italy leather boutique pilot. **Roadmap** maps milestones M1–M5+ to that order.
>>>>>>> origin/cursor/commercial-viability-report-7c94

```bash
pnpm docs:dev     # http://localhost:5173 — passcode: pilot-docs
pnpm docs:build   # → apps/docs/dist
```

## Commercial viability reports

Five full assessments as native TSX JSX (converted from legacy HTML):

| Route | Page |
|-------|------|
| `#/commercial-viability` | Hub + scorecard |
| `#/commercial-viability/report` | Primary assessment |
| `#/commercial-viability/assessment` | Assessment variant |
| `#/commercial-viability/deep-assessment` | Deep assessment |
| `#/commercial-viability/deep-dive` | Deep dive |
| `#/commercial-viability/deep-dive-2026` | 2026 deep dive |

To regenerate TSX from HTML sources (if restored): `pnpm docs:convert-html`

Deploy: GitHub Pages or Vercel — see `apps/docs/DEPLOY.md`.
