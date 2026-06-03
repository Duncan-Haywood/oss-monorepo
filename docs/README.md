# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

Key pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan` — market, pricing, GTM, payback, partners, CS), **Roadmap** (`/roadmap`).

Hosted builds use a passcode gate; see root **README** → *Private hosted docs* for GitHub Pages and Vercel setup.

Planning starts at **Business value & ROI** (`/roi`) — ranks 1–3 first (door+POS, desirability gap, upsell), then weighted score, build cost, payback, and monthly/annual € scenarios for the Italy leather boutique pilot. **Roadmap** maps milestones M1–M5+ to that order.

```bash
pnpm docs:dev
pnpm docs:build   # output: apps/docs/dist
```

CI builds and uploads `apps/docs/dist` on every push to `main`.
