# Documentation sources

Product narrative and long-form reports live in **`apps/docs`** as **TSX** (canonical).

| Location | Role |
|----------|------|
| `apps/docs/src/pages/` | Site pages (business plan, GTM, ROI, etc.) |
| `apps/docs/src/reports/` | Long-form assessments (commercial viability, deep dives) |

```bash
pnpm docs:sync    # scripts/build-report-manifest.ts — register report modules
pnpm docs:dev     # passcode: pilot-docs (gate off in dev unless PROD)
pnpm docs:build
```

Each report exports `reportMeta` and a page component. Legacy `/reports/docs-*` URLs redirect to the new slugs.

Deploy: GitHub Pages (`.github/workflows/deploy-docs.yml`) and/or Vercel — see `apps/docs/DEPLOY.md`. Enable **Deployment Protection** or keep the repo private; passcode gate is `VITE_DOCS_PASSCODE`.

**Optional:** `pnpm exec tsx scripts/migrate-html-to-tsx-reports.ts` imports legacy HTML from `docs/` or `reports/` into TSX modules (one-time migration helper).
