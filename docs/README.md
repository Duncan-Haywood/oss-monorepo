# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

Key pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan`), **Roadmap** (`/roadmap`).

Planning starts at **Business value & ROI** (`/roi`) — ranks 1–3 (door+POS, desirability gap, upsell) before window/outdoor CV; monthly and annual € scenarios for the Italy leather boutique pilot. **Roadmap** maps milestones M1–M5+ to that order.

```bash
pnpm docs:dev
pnpm docs:build   # output: apps/docs/dist
```

CI builds and uploads `apps/docs/dist` on every push to `main`.
