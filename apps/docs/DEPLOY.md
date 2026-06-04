# Private documentation site — deployment

The docs app (`apps/docs`) is a **passcode-gated** Vite/React SPA. Product narrative lives in **TSX pages**; long-form **HTML and Markdown** under `docs/` and `reports/` are compiled into `public/generated/` at build time.

## Local

```bash
pnpm install
pnpm docs:sync    # HTML/MD → apps/docs/public/generated + manifest
pnpm docs:dev     # http://localhost:5173 — passcode: atelier-docs
pnpm docs:build   # → apps/docs/dist
```

Set `VITE_DOCS_AUTH_DISABLED=true` only for local UI work without the gate.

## Custom domain (Vercel)

1. Create a Vercel project with **Root Directory** = `apps/docs` (monorepo).
2. Add domain, e.g. `docs.retailpilotintel.com` (or your pilot subdomain).
3. Set production env vars:
   - `VITE_DOCS_PASSCODE` — stakeholder passcode (never commit real values).
4. Enable **Deployment Protection** → *Password protection* or *Vercel Authentication* on the project. This is the real network boundary; the client passcode is for casual link sharing only.

## Security layers

| Layer | Purpose |
|-------|---------|
| Vercel Deployment Protection | Blocks unauthenticated visitors before static assets load |
| `VITE_DOCS_PASSCODE` | Session gate in the browser (8h), same pattern as the sales portal |
| `X-Robots-Tag: noindex` | Keeps collateral off search indexes if a URL leaks |
| Private GitHub repo | Source control boundary |

## CI

`pnpm run ci` runs `docs:build`, which syncs HTML sources and uploads `apps/docs/dist` as a GitHub Actions artifact.

Optional: `.github/workflows/deploy-docs.yml` deploys to Vercel when `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets are configured.
