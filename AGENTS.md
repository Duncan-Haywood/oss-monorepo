# Agent instructions — Retail Pilot Intel

## Documentation policy (TSX)

1. **Canonical format:** Product documentation lives in **`apps/docs/src/pages/*.tsx`**, not Markdown or HTML reports.
2. **Do not** create new long-form `.md` or `.html` under `docs/` or `reports/`; extend the Vite docs app instead.
3. **One-off sharing:** Run `pnpm docs:export` for static HTML (`apps/docs/dist/`). For PDF, use browser Print from `pnpm docs:preview` on the target route.
4. **Migration:** `pnpm docs:convert-html` only when refreshing TSX from legacy HTML sources.

See `.cursor/rules/documentation-tsx.mdc` for full rules.

## Repo commands

```bash
pnpm install
pnpm docs:dev          # preview docs (passcode: pilot-docs)
pnpm docs:build        # production build
pnpm docs:export       # build + print dist path (one-off HTML)
pnpm run ci            # typecheck, lint, build, bootstrap smoke
```

## Code changes

- Match existing monorepo conventions (pnpm workspaces, ESLint, TypeScript strict).
- Minimize scope; do not refactor unrelated packages.
- Package READMEs: CLI only + link to docs site routes.
