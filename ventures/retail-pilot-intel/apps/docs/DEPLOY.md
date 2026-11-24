# Private documentation site — deployment

The docs app (`apps/docs`) is a **passcode-gated** Vite/React SPA. All documentation is **TSX** under `src/pages/`.

## Build

```bash
pnpm docs:build   # → apps/docs/dist
```

Legacy `/reports/*` and `/archive/*` URLs redirect to `/commercial-viability/*` TSX routes. Overview: **`docs/deployment.md`**.

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

### Cloudflare Worker (replaces Vercel, 2026-11-24)

`wrangler.toml` here deploys `dist/` as a static-assets Worker, `retail-pilot-intel-docs`, on the free
plan (no code runs, so requests are never metered). `public/_headers` sends the same headers
`vercel.json` did (`X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, ...).

```bash
pnpm docs:build
cd apps/docs && npx wrangler@4.145.0 dev        # serve dist/ as Cloudflare would
npx wrangler@4.145.0 deploy --dry-run           # check the config
```

CI: job `deploy-cloudflare` in `.github/workflows/retail-pilot-intel-deploy-docs.yml` (manual run, or
every docs push once `RETAIL_PILOT_INTEL_DOCS_CLOUDFLARE=true`). Build env: `DOCS_PASSCODE` secret,
`DOCS_SITE_URL` variable. For a network boundary beyond the client passcode, put Cloudflare Access in
front of the workers.dev host.

## Security layers

| Layer | Purpose |
|-------|---------|
| Private GitHub repo | Source control |
| Cloudflare Access (optional) | Network access |
| `VITE_DOCS_PASSCODE` + `VITE_DOCS_GATE_ENABLED` | Browser session gate (12h) |
| `X-Robots-Tag: noindex` | Discourage indexing if URL leaks |

## Converting legacy HTML

If HTML sources are restored under `docs/` or `reports/`, run `pnpm docs:convert-html` to regenerate TSX in `apps/docs/src/pages/commercial-viability/`.
