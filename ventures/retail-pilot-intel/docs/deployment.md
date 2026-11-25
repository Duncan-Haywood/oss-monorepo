# Private docs — domain, security & hosting

The documentation app lives in `apps/docs`. **TSX under `src/pages/` is canonical.** Legacy HTML under `docs/` and `reports/` is source material for optional `pnpm docs:convert-html` regeneration.

## Build

```bash
pnpm install
pnpm docs:build   # tsc + Vite → apps/docs/dist
```

CI: `scripts/ci.ts` (typecheck, lint, build, bootstrap).

## Security layers (use together in production)

| Layer | Purpose |
|-------|---------|
| **Private GitHub repo** | Source control |
| **Cloudflare Access** (optional, free up to 50 users) | Network boundary in front of the Worker |
| **`VITE_DOCS_PASSCODE`** + **`VITE_DOCS_GATE_ENABLED`** | Browser session gate (12h, `sessionStorage`) |
| **`X-Robots-Tag: noindex`** | Discourage indexing if URL leaks |

Local dev: gate off by default. Force on with `VITE_DOCS_GATE_ENABLED=true`. Default passcode when enabled: `pilot-docs`.

## GitHub Pages

1. **Settings → Pages → Source:** GitHub Actions
2. Secret **`DOCS_PASSCODE`** (workflow `.github/workflows/deploy-docs.yml`)
3. Optional **`DOCS_SITE_URL`** repository variable for canonical meta
4. Push to `main` → publishes `apps/docs/dist`

## Cloudflare (replaces Vercel, 2026-11-24)

The docs are a free-plan Cloudflare Worker of their own, `retail-pilot-intel-docs`, serving
`apps/docs/dist` as static files (`apps/docs/wrangler.toml`; headers in `apps/docs/public/_headers`).
Address: `https://retail-pilot-intel-docs.<account subdomain>.workers.dev/`.

CI job `deploy-cloudflare` in `.github/workflows/priv-retail-pilot-intel-deploy-docs.yml` publishes it on
a manual run, or on every docs push once the repository variable `RETAIL_PILOT_INTEL_DOCS_CLOUDFLARE`
is `true`. It uses the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets the portfolio site
already uses. Optional: `DOCS_SITE_URL` for canonical meta, and Cloudflare Access on the workers.dev
host for a real login in front of the passcode.

Vercel: the old `deploy-vercel` job never published (`VERCEL_DEPLOY` was never set, so every run
skipped it), so no Vercel URL needs a redirect. `vercel.json` and `vercel.docs.json` are removed.

## Docker / LAN

```bash
pnpm docs:build
docker compose up docs   # http://localhost:8080
```

Optional nginx basic auth: `docker/docs.htpasswd.example` → `docker/docs.htpasswd`, use `docker/docs.nginx-with-auth.conf`.

## Legacy URLs

`/reports/*` and `/archive/*` redirect to `/commercial-viability/*` TSX routes.

## Regenerating TSX from HTML

```bash
pnpm docs:convert-html
```

Sources: `docs/commercial-viability-report.html`, `reports/commercial-viability-*.html`.

Operational detail: **`apps/docs/DEPLOY.md`**.
