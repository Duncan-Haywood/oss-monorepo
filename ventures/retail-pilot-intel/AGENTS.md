# Agent instructions — Retail Pilot Intel

## Documentation policy (TSX)

1. **Canonical format:** Product documentation lives in **`apps/docs/src/pages/*.tsx`**, not Markdown or HTML reports.
2. **Prefer not to** create new long-form `.md` or `.html` under `docs/` or `reports/`; extend the Vite docs app instead.
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
- Minimize scope; avoid refactoring unrelated packages.
- Package READMEs: CLI only + link to docs site routes.

## Cursor Cloud specific instructions

### Runtime

- **Node.js ≥ 22** (`.nvmrc` is `22`; CI uses Node 22). Built-in **`node:sqlite`** powers analytics — expect `ExperimentalWarning: SQLite is an experimental feature` during `pnpm bootstrap` / CI; this is normal on Node 22.
- **pnpm 9.15.4** via `packageManager` in root `package.json`. Install deps from repo root: `pnpm install`.

### Verify without dev servers

`pnpm run ci` runs typecheck, ESLint, production builds, and the data-pipeline smoke (`pnpm bootstrap`). No HTTP services required.

### Dev servers (sales / docs demo)

| App | Command | URL | Passcode |
|-----|---------|-----|----------|
| Docs | `pnpm docs:dev` | http://localhost:5173 | `pilot-docs` (gate skipped in dev unless `VITE_DOCS_REQUIRE_AUTH=true`) |
| Portal | `pnpm portal:dev` | http://localhost:5174 | `atelier-demo` |

Vite binds to **localhost** (IPv6 `::1`). Use `http://localhost:5173` / `5174` for health checks — `http://127.0.0.1:…` may fail with connection refused.

Run both servers in separate terminals (or tmux panes) for the full stakeholder walkthrough described in root `README.md`.

### Data pipeline (CLI only)

`pnpm bootstrap` writes sample edge/POS files and syncs into `data/pilot.db`. Individual CLIs: `packages/edge`, `packages/pos`, `packages/analytics` (see package READMEs).

### Optional Docker

`docker compose up docs` serves built docs on port 8080; `analytics-sync` is optional for long-running sync — not needed for routine dev or CI.

## Learned User Preferences

- Prioritize profitable-first, software-first, AI-first, hiring-last, and minimal founder intervention for scheduled or autonomous agent runs.
- Hourly automation should ship one incremental, shippable step per run when possible; default to the smallest diff that passes CI.
- Scheduled automations should read `.cursor/automations/retail-pilot-intel-orchestrator.md` from repo `main` — the dashboard bootstrap is only a pointer, not the full prompt.
- Leave business-model pivots to the founder, since they change what the product is: log pivot signals and stop for review rather than executing one.
- Do not invent pilot customers, revenue figures, or signed legal artifacts (e.g. DPIAs).
- Treat GDPR/EU privacy as a go-live gate alongside profit metrics; prepare compliance artifacts but do not claim compliance without a signed pilot DPIA.
- Product and stakeholder documentation belongs in TSX under `apps/docs`; TypeScript is the default for infra and CI scripts too.

## Learned Workspace Facts

- GitHub repo: `Duncan-Haywood/retail-pilot-intel` (private); default branch `main`.
- Initial design partner wedge: ~10 m² leather boutique in Italy; on-device aggregation and no customer identity are core product constraints.
- Product thesis: store-local door counts plus POS join → weekly € decisions for owners; pricing anchored to one incremental sale per month, not sensor count.
- Current maturity: M0 done, M1 in progress; `packages/edge` and `packages/pos` are sample stubs; `apps/portal` uses illustrative `demoStore.ts`, not live SQLite.
- Commercial viability verdict in docs: ~6.2/10 conditional pursue — strong GTM and docs collateral, weak live product proof.
- Orchestrator state lives in `ORCHESTRATOR.md`, `docs/PRODUCT.md`, `docs/BACKLOG.md`, `docs/IDEAS.md`, and `docs/PROGRESS.md`.
- ROI-ranked delivery order: door plus POS join (ranks 1–3) before desirability gap, before window or outdoor CV (rank 8).
- Commercial viability reports are TSX pages under `/commercial-viability/*` in the docs app.
