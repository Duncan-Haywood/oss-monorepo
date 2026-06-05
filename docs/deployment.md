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
| **GitHub Pages (private repo)** or **Vercel Deployment Protection** | Network boundary |
| **`VITE_DOCS_PASSCODE`** + **`VITE_DOCS_GATE_ENABLED`** | Browser session gate (12h, `sessionStorage`) |
| **`X-Robots-Tag: noindex`** | Discourage indexing if URL leaks |

Local dev: gate off by default. Force on with `VITE_DOCS_GATE_ENABLED=true`. Default passcode when enabled: `pilot-docs`.

## GitHub Pages

1. **Settings → Pages → Source:** GitHub Actions
2. Secret **`DOCS_PASSCODE`** (workflow `.github/workflows/deploy-docs.yml`)
3. Optional **`DOCS_SITE_URL`** repository variable for canonical meta
4. Push to `main` → publishes `apps/docs/dist`

## Vercel (custom domain)

1. Import repo — use root **`vercel.docs.json`** (monorepo build) or **`apps/docs/vercel.json`** (project root = `apps/docs`)
2. **Domains** → e.g. `docs.retailpilotintel.com` (CNAME → `cname.vercel-dns.com`)
3. Env: `VITE_DOCS_PASSCODE`, `VITE_DOCS_GATE_ENABLED=true`, `VITE_DOCS_SITE_URL`
4. **Deployment Protection** (password or SSO)

Optional CI job `deploy-vercel` when repository variable `VERCEL_DEPLOY=true` and secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` are set.

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
