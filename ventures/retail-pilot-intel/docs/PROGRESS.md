# Orchestrator run log

Newest first. Each hourly/half-hourly run appends an entry.

---

## 2026-08-25 — Live Overview KPIs from SQLite

**Theme shipped:** Read-only `serve-kpis` LAN API (`GET /api/kpis/today|latest|?date=`) plus portal `VITE_PILOT_API_URL`. Overview headline cards now show joined door + POS numbers from `data/pilot.db` when the env var is set, with a live / illustrative / API-offline badge. Unset env keeps `demoStore.ts`. Engaged-visit and hourly/SKU panels stay illustrative so we do not invent metrics the DB does not have.

**Tests:** `kpi-server.test.ts` (payload, latest-day, CORS allowlist, date validation) and portal `pilot-kpis.test.ts` (Euro mapping, empty-today copy). Existing engagement-log CTA count now ignores KPI events.

**Backlog:** Marked LAN API, `VITE_PILOT_API_URL`, and Overview source badge done.

**Top 3 next run tasks:**

1. Hourly rollup table + CLI `report --hour` so the Overview chart can leave illustrative data
2. POS adapter v0: watch `data/pos/inbox` for Tilby-style CSV export
3. Edge CLI `--sample` batch mode simulating a day of entries/exits/bounces

---

## 2026-08-24 — Revenue in dailySummary

**Theme shipped:** `dailySummary` (`packages/analytics/src/report.ts`) now returns `revenue_cents` (sum of `sale_events.total_cents` for the day) and `revenue_per_entrant_cents` (revenue divided by entries, rounded, zeroed when there are no entries). A sale with a null `total_cents` counts as zero revenue rather than corrupting the sum. Flows through unchanged to `printReport`/`cli.ts report`, since both already iterate the summary object's fields.

**Tests:** Extended `report.test.ts` with 3 new cases (revenue sum + rounding, null `total_cents`, updated the two `deepEqual` fixtures for the new fields) — 18/18 pass in `packages/analytics`. Ran `pnpm -r --if-present run test` at the venture root: all workspace packages pass. `pnpm typecheck` clean.

**Backlog:** Marked "Extend `dailySummary` with revenue cents + revenue per entrant" done in `docs/BACKLOG.md`.

**Top 3 next run tasks:**

1. Hourly rollup table + CLI `report --hour` for same-day ops
2. POS adapter v0: watch `data/pos/inbox` for Tilby-style CSV export
3. Edge CLI `--sample` batch mode simulating a day of entries/exits/bounces

---

## 2026-06-12 — Orchestrator bootstrap

**Hygiene:** Created orchestrator automation + state files (`ORCHESTRATOR.md`, `docs/PRODUCT.md`, `docs/BACKLOG.md`, `docs/IDEAS.md`, this log). Remote `cursor/*` security branches present — review on first scheduled run.

**Theme shipped:** Automation prompt and maturity/backlog framework committed for Cursor scheduled agents.

**Maturity changes:** Baseline subsystem table initialized in `docs/PRODUCT.md` (M0 done; M1–M4 not started).

**CI:** `pnpm run ci` — typecheck, lint, build, bootstrap smoke (no dedicated unit test suite yet).

**Docs routes:** 12 primary nav routes + 6 commercial-viability sub-routes. **Portal routes:** 6 (`/`, `/value`, `/funnel`, `/products`, `/experiments`, `/trust`).

**Launch gates remaining:** G1–G4 red; G6–G7 partial; G8 red (see `docs/PRODUCT.md`).

**Top 3 next run tasks:**

1. Add analytics unit tests + revenue-per-entrant in `dailySummary`
2. POS adapter v0 (CSV inbox) or edge batch sample for realistic funnel replay
3. Branch hygiene — triage `origin/cursor/*` security-review branches
