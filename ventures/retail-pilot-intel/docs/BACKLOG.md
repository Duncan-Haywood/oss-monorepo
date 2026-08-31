# Backlog — Retail Pilot Intel

Curated queue for the hourly orchestrator. **Ready** items are shippable in one run; pick 1–3 per run aligned to [PRODUCT.md](PRODUCT.md) gates.

Status: `ready` | `in_progress` | `done`

---

## Ready (highest ROI first)

### [platform] Persistence & pipeline

- [ ] **ready** — Hourly rollup table + CLI `report --hour` for same-day ops
- [ ] **ready** — POS adapter v0: watch `data/pos/inbox` for Tilby-style CSV export (document format in package README)

### [platform] Edge & join

- [ ] **ready** — Edge CLI: periodic `--sample` batch mode simulating a day of entries/exits/bounces
- [ ] **ready** — Funnel join module in `packages/analytics` (shared by CLI + future LAN API)
- [x] **done** — Small read-only LAN API (Node HTTP) serving latest KPIs from SQLite for portal (`serve-kpis`)

### [portal] Operator truth

- [x] **done** — Portal env flag `VITE_PILOT_API_URL` → fetch KPIs when set; fallback to `demoStore.ts`
- [x] **done** — Overview page: show data source badge (`live` vs `illustrative`)

### [gtm] Sales enablement

- [ ] **ready** — `/demo` page: link install checklist + env vars from `.env.example`
- [ ] **ready** — One-page DPIA checklist TSX under `/privacy` (owner sign-off placeholder)

### [hygiene]

- [ ] **ready** — Review/delete stale `origin/cursor/*` security-review branches merged or obsolete
- [ ] **ready** — Extract shared KPI types to `packages/schemas` for portal + analytics

---

## In progress

_(empty — orchestrator assigns when a run starts themed work)_

---

## Done

- [x] **done** — Extend `dailySummary` with `revenue_cents` (sum of `total_cents` from `sale_events` on the day) + `revenue_per_entrant_cents` (revenue divided by entries, rounded, zeroed when there are no entries); a null `total_cents` on a sale counts as zero revenue rather than corrupting the sum
- [x] **done** — Archive processed inbox JSON after sync (moves each file to a sibling `archive/` dir once inserted; `sale_events`/`aggregate_events` are already keyed on `event_id` with `INSERT OR REPLACE`, so this is a performance/hygiene fix — unbounded inbox re-scan on every sync — not a correctness one; `archive: false` opt-out kept for tests/tooling)
- [x] **done** — Unit tests for `packages/analytics` (`dailySummary`, `syncInbox`, schema inserts) — `node:test` via `tsx`, wired into `pnpm run test` / `pnpm run ci`
- [x] **done** — M0: TSX docs site + commercial viability pages + CI (`pnpm run ci`)
- [x] **done** — Event schemas + SQLite schema + inbox sync path
- [x] **done** — Sales portal with illustrative Milano boutique data + presenter guides
- [x] **done** — Bootstrap script: sample edge + POS → sync → report
- [x] **done** — Docs deploy workflows (GitHub Pages + optional Vercel)
