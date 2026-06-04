# Documentation

**Commercial viability report** (standalone HTML): [`commercial-viability-report.html`](./commercial-viability-report.html) — also synced into the TSX docs site at build time.

Product docs live in **`apps/docs`** as TSX pages, built with Vite (HashRouter for static hosts). Standalone HTML under `docs/` and `reports/` is copied into the site by `pnpm docs:sync-html` before each build.

Key pages: **ROI & priorities** (`#/roi`), **Business plan** (`#/business-plan`), **GTM** (`#/gtm`), **Roadmap** (`#/roadmap`).

## Local development

```bash
pnpm docs:dev
# Passcode gate off in dev by default; force on with VITE_DOCS_GATE_ENABLED=true
```

```bash
pnpm docs:sync-html   # copy HTML → apps/docs/public/html-reports + manifest
pnpm docs:build       # sync + Vite build → apps/docs/dist
```

## Private hosting (recommended paths)

| Host | Best for | Privacy layers |
|------|----------|------------------|
| **GitHub Pages** | Team already on GitHub; free static hosting | Private repo + `DOCS_PASSCODE` secret + in-app gate + `noindex` |
| **Vercel** | Custom domain, Deployment Protection | Root `apps/docs` + `vercel.json` + `VITE_DOCS_PASSCODE` + Vercel auth |
| **Docker / LAN** | Pilot store or VPN-only | `docker compose up docs` on port 8080; optional nginx basic auth |

### GitHub Pages

1. Repo **Settings → Pages → Build and deployment**: Source = **GitHub Actions**.
2. Add repository secret **`DOCS_PASSCODE`** (share with stakeholders out-of-band).
3. Push to `main` — workflow **Deploy docs** (`.github/workflows/deploy-docs.yml`) builds and publishes.
4. Optional: attach a custom domain under Pages settings (HTTPS via GitHub).

CI on every push still uploads `docs-dist` as an artifact for download without publishing.

### Vercel (custom domain)

1. Import the repo; set **Root Directory** to `apps/docs`.
2. Add **`VITE_DOCS_PASSCODE`** (Production + Preview) and **`VITE_DOCS_GATE_ENABLED=true`** for production.
3. Enable **Deployment Protection** (password or SSO) for real access control beyond the client gate.
4. Add your domain under **Domains** in the Vercel project.

### Docker (edge / local)

```bash
pnpm docs:build
docker compose up docs
# http://localhost:8080
```

For nginx HTTP basic auth, generate `docker/docs.htpasswd` from `docker/docs.htpasswd.example` and swap in `docker/docs.nginx-with-auth.conf`.

## Access gate

Production builds enable a **passcode screen** (`VITE_DOCS_PASSCODE`, default `pilot-docs` if unset). Session lasts 12 hours in `sessionStorage`. Disable for local dev with `VITE_DOCS_GATE_ENABLED=false`.

Pair the client gate with platform-level auth (Vercel Deployment Protection, nginx basic auth, or private GitHub Pages) for sensitive material.
