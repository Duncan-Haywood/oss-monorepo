# Private docs site — domain & security

The documentation app lives in `apps/docs`. Product pages are **TSX** under `src/pages/`. Legacy **HTML** under `docs/` and `reports/` is source material for `pnpm docs:convert-html` (optional regeneration).

## Build pipeline

```bash
pnpm install
pnpm docs:build   # tsc + Vite → apps/docs/dist
```

CI runs typecheck, lint, full monorepo build, and bootstrap — see `scripts/ci.ts`.

## Security layers (use together in production)

| Layer | What it does |
|-------|----------------|
| **Vercel Deployment Protection** | Password or SSO on the deployment URL before any static file is served. |
| **Custom domain** | e.g. `docs.retailpilotintel.com` — Vercel → Domains, CNAME to `cname.vercel-dns.com`. |
| **`VITE_DOCS_PASSCODE`** | Client-side gate baked at build time (session in `sessionStorage`, 12h). Not a substitute for server auth. |
| **Private GitHub repo** | Source and CI artifacts stay off public indexes. |

See **`apps/docs/DEPLOY.md`** for GitHub Pages, Vercel env vars, and local dev (`pilot-docs` passcode).

## Regenerating TSX from HTML

```bash
pnpm docs:convert-html
```

Sources: `docs/commercial-viability-report.html`, `reports/commercial-viability-*.html`.
