# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

```bash
pnpm docs:dev
pnpm docs:build   # output: apps/docs/dist
```

CI builds and uploads `apps/docs/dist` on every push to `main`.
