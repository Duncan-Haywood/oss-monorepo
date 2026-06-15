# AGENTS.md

## Cursor Cloud specific instructions

This repo has two Next.js 14 (App Router) static-export sites — no backend, database, or app auth.

### Research report (`research/`)

- **Run (dev):** `cd research && npm run dev` → http://localhost:3000
- **Build:** `cd research && npm run build` → static export in `research/out/`
- **Lint/typecheck gotcha:** `npm run lint` hangs without an ESLint config. Use `npm run build` instead (runs typecheck + lint non-interactively).
- No environment variables required for dev or build.

### Docs site (`docs-site/`)

Private documentation deployed to **Cloudflare Pages** with **Cloudflare Access** (single-email allowlist: `duncan.andrew.haywood@gmail.com`).

- **Run (dev):** `cd docs-site && npm run dev` → http://localhost:3000
- **Build:** `cd docs-site && npm run build` → static export in `docs-site/out/`
- **Deploy:** `cd docs-site && npm run pages:deploy` (requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`)
- **Live URL:** https://listing-lens-docs.pages.dev
- **Access policy:** `DOCS_HOSTNAME=listing-lens-docs.pages.dev ./docs-site/scripts/setup-cloudflare-access.sh`
- GitHub Actions deploy: `.github/workflows/deploy-docs.yml` (secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- Local dev does not enforce Access; production is gated at the Cloudflare edge.
