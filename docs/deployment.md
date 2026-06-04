# Private docs site — domain & security

The documentation app lives in `apps/docs`. Product pages are **TSX**; standalone **HTML/Markdown** under `docs/` and `reports/` are compiled in via `pnpm docs:sync` before every build.

## Build pipeline

```bash
pnpm install
pnpm docs:sync    # HTML/MD → apps/docs/src/generated/
pnpm docs:build   # sync + Vite → apps/docs/dist
```

CI runs `docs:sync` then builds and uploads `apps/docs/dist` as an artifact.

## Security layers (use together in production)

| Layer | What it does |
|-------|----------------|
| **Vercel Deployment Protection** | Password or SSO on the deployment URL before any static file is served. Configure in Vercel → Project → Settings → Deployment Protection. |
| **Custom domain** | e.g. `docs.your-domain.com` — Vercel → Domains, add CNAME to `cname.vercel-dns.com`. |
| **`VITE_DOCS_PASSCODE`** | Client-side gate baked at build time (session in `sessionStorage`, 12h). Not a substitute for server auth. |
| **Private GitHub repo** | Source and CI artifacts stay off public indexes. |

### Environment variables (Vercel project)

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_DOCS_PASSCODE` | Yes (prod) | Strong shared secret; rotate when people leave. |
| `VITE_DOCS_SKIP_AUTH` | No | Set `true` only for local dev — never in production. |

Copy from `.env.example` for local work:

```bash
VITE_DOCS_PASSCODE=your-team-secret
# VITE_DOCS_SKIP_AUTH=true   # optional local only
```

Default passcode if unset: `rpi-docs-private` (change in production).

## Deploy to Vercel

1. Import the monorepo in Vercel.
2. Set **Root Directory** to `apps/docs` (uses `apps/docs/vercel.json`).
3. Add env vars above.
4. Enable **Deployment Protection** (recommended: Vercel Password).
5. Attach your custom domain.

GitHub Actions can deploy on push to `main` when `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are configured (see `.github/workflows/deploy-docs.yml`).

## Local preview

```bash
pnpm docs:dev
# Passcode: value of VITE_DOCS_PASSCODE or default rpi-docs-private
# Or: VITE_DOCS_SKIP_AUTH=true pnpm docs:dev
```

Hash routes (`#/roi`, `#/reports/commercial-viability-report`) work on static hosts without server rewrites.

## Adding HTML reports

1. Place `.html` or `.md` in `docs/` or `reports/` (not `README.md`).
2. Run `pnpm docs:sync`.
3. Open **HTML reports** in the nav or `#/reports/<slug>`.

Slug is derived from the filename (e.g. `commercial-viability-assessment.html` → `/reports/commercial-viability-assessment`).
