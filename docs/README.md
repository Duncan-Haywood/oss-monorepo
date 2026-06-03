# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

Key pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan` — market, pricing, GTM, payback, partners, CS), **Roadmap** (`/roadmap`).

Planning starts at **Business value & ROI** (`/roi`) — ranks 1–3 first (door+POS, desirability gap, upsell), then weighted score, build cost, payback, and monthly/annual € scenarios for the Italy leather boutique pilot. **Roadmap** maps milestones M1–M5+ to that order.

```bash
pnpm docs:dev
pnpm docs:build   # output: apps/docs/dist
```

CI builds `apps/docs/dist` on every push to `main`. The **Deploy docs (GitHub Pages)** workflow publishes the site to private GitHub Pages (Settings → Pages → Source: GitHub Actions; visibility: Private).

For external stakeholders without GitHub access, see `vercel.docs.json` and the **Vercel** section in the root `README.md`.
