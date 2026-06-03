# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite (HashRouter for static hosts).

Key pages: **ROI & priorities** (`#/roi`), **Business plan** (`#/business-plan`), **Roadmap** (`#/roadmap`).

## Local development

```bash
pnpm docs:dev
# Gate off locally by default in dev; force on with VITE_DOCS_GATE_ENABLED=true
```

```bash
pnpm docs:build   # output: apps/docs/dist
```

## Private hosting (recommended paths)

| Host | Best for | Privacy layers |
|------|----------|------------------|
| **GitHub Pages** | Team already on GitHub; free static hosting | Private repo + `DOCS_PASSCODE` secret + in-app gate + `noindex` |
| **Vercel** | Fast previews, password / Deployment Protection | `apps/docs/vercel.json` + env `VITE_DOCS_PASSCODE` + Vercel auth |
| **Docker / LAN** | Pilot store or VPN-only | `docker compose up docs` on port 8080; optional nginx basic auth |

### GitHub Pages

1. Repo **Settings → Pages → Build and deployment**: Source = **GitHub Actions**.
2. Add repository secret **`DOCS_PASSCODE`** (shared with stakeholders out-of-band).
3. Push to `main` — workflow **Deploy docs** (`.github/workflows/deploy-docs.yml`) builds and publishes.
4. Pages URL appears under the `github-pages` environment after first successful run.

CI on every push still uploads `docs-dist` as an artifact for download without publishing.

### Vercel

1. Import the repo; set **Root Directory** to `apps/docs`.
2. Add environment variable **`VITE_DOCS_PASSCODE`** (Production + Preview).
3. Optional: enable **Deployment Protection** (password or SSO) in the Vercel project for real access control.
4. Build uses `vercel.json`; headers include `X-Robots-Tag: noindex`.

### Docker (edge / local)

```bash
pnpm docs:build
docker compose up docs
# http://localhost:8080 — passcode gate active if built with VITE_DOCS_GATE_ENABLED=true
```

For nginx HTTP basic auth, generate `docker/docs.htpasswd` from `docker/docs.htpasswd.example` and swap in `docker/docs.nginx-with-auth.conf`.

## Access gate

Production builds enable a **passcode screen** (`VITE_DOCS_PASSCODE`, default `pilot-docs` if unset). Session lasts 12 hours in `sessionStorage`. Disable for local dev with `VITE_DOCS_GATE_ENABLED=false`.

This is not a substitute for platform-level auth on highly sensitive material — use Vercel Deployment Protection or nginx auth in addition.
