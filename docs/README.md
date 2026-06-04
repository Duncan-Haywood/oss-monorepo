# Documentation sources

Product narrative lives in **`apps/docs`** as **TSX pages** (canonical). This folder holds **HTML/Markdown sources** compiled into the private docs site at build time.

| Source | Build output | View in app |
|--------|----------------|-------------|
| `*.html` here and in `../reports/` | `public/html-reports/` + iframe `/reports/:slug` | Full-page layout |
| `*.md` here | `public/generated/` + inline `/archive/:slug` | Extracted content |

```bash
pnpm docs:sync    # runs sync-html-docs.ts + build-doc-sources.ts
pnpm docs:dev     # passcode: pilot-docs (gate off in dev unless PROD)
pnpm docs:build
```

**Commercial viability** — TSX summary at `#/commercial-viability`; full HTML at `#/reports/docs-commercial-viability-report`.

Deploy: GitHub Pages (`.github/workflows/deploy-docs.yml`) and/or Vercel with custom domain — see `apps/docs/DEPLOY.md`. Enable **Deployment Protection** or keep the repo private; passcode gate is `VITE_DOCS_PASSCODE`.
