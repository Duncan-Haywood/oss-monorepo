# Hosting private documentation

Product docs are a static Vite build (`apps/docs/dist`). Use **layered access** — not obscurity alone.

## Recommended stack

| Layer | Purpose |
|-------|---------|
| Private GitHub repo | Source control |
| GitHub Pages (private repo) or Vercel Deployment Protection | Network boundary |
| `VITE_DOCS_PASSCODE` + `VITE_DOCS_GATE_ENABLED` | Browser session gate |
| `X-Robots-Tag: noindex` | Discourage indexing if URL leaks |

Full setup: **`apps/docs/DEPLOY.md`**. Domain and env reference: **`docs/deployment.md`**.

## Quick start

```bash
pnpm docs:dev     # http://localhost:5173 — passcode: pilot-docs
pnpm docs:build
```

Docker/nginx optional: `docker-compose.yml` with `docker/docs.nginx.conf` or `docker/docs.nginx-with-auth.conf`.
