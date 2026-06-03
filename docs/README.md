# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

Planning starts at **Priorities & ROI** (`/priorities`) — initiatives ranked by expected € impact for the leather boutique pilot in Italy, then **Roadmap** for milestone order.

```bash
pnpm docs:dev
pnpm docs:build   # output: apps/docs/dist
```

CI builds and uploads `apps/docs/dist` on every push to `main`.
