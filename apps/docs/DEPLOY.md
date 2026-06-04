# Private documentation site — deployment

The docs app (`apps/docs`) is a **passcode-gated** Vite/React SPA. Product narrative lives in **TSX pages**; **HTML** under `docs/` and `reports/` is synced at build time (iframe reports + inline archive).

## Build pipeline

```bash
pnpm docs:sync
# 1. scripts/sync-html-docs.ts  → apps/docs/public/html-reports/ + htmlReportManifest.ts
# 2. scripts/build-doc-sources.ts → apps/docs/public/generated/ + source-manifest.ts
pnpm docs:build   # → apps/docs/dist
```

## Local

```bash
pnpm docs:dev     # http://localhost:5173
# Passcode default: pilot-docs
# Disable gate locally: VITE_DOCS_GATE_ENABLED=false
```

## Hosting options

### GitHub Pages (included workflow)

1. Repo **Settings → Pages** → source: **GitHub Actions**
2. Set repository secret `DOCS_PASSCODE` (used at build for `VITE_DOCS_PASSCODE`)
3. Push to `main` — workflow `.github/workflows/deploy-docs.yml` publishes `apps/docs/dist`

Private repo + passcode gate is suitable for stakeholder links. Add org SSO via GitHub if required.

### Vercel (custom domain)

1. Import repo; use root **`vercel.docs.json`** (or set project root to repo root with that config).
2. Add domain e.g. `docs.retailpilotintel.com` in **Project → Settings → Domains** (CNAME to `cname.vercel-dns.com`).
3. Env vars (Production + Preview):
   - `VITE_DOCS_PASSCODE` — stakeholder passcode (also set as GitHub secret `DOCS_PASSCODE` for Pages)
   - `VITE_DOCS_GATE_ENABLED=true`
   - `VITE_DOCS_SITE_URL=https://docs.retailpilotintel.com` — canonical URLs in page meta
4. Enable **Deployment Protection** (password or Vercel Authentication) — network boundary beyond the client passcode

Optional CI job `deploy-vercel` runs when `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets exist.

## Security layers

| Layer | Purpose |
|-------|---------|
| Private GitHub repo | Source control |
| GitHub Pages (private repo) or Vercel Deployment Protection | Network access |
| `VITE_DOCS_PASSCODE` + `VITE_DOCS_GATE_ENABLED` | Browser session gate (12h) |
| `X-Robots-Tag: noindex` | Discourage indexing if URL leaks |
