# Backlog — Retail Pilot Intel

Curated queue for the hourly orchestrator. **Ready** items are shippable in one run; pick 1–3 per run aligned to [PRODUCT.md](PRODUCT.md) gates.

Status: `ready` | `in_progress` | `done`

---

## Ready (highest ROI first)

### [platform] Persistence & pipeline

- [ ] **ready** — Extend `dailySummary` with revenue cents + revenue per entrant from `sale_events`
- [ ] **ready** — Hourly rollup table + CLI `report --hour` for same-day ops
- [ ] **ready** — Archive processed inbox JSON after sync (idempotent ingest)
- [ ] **ready** — POS adapter v0: watch `data/pos/inbox` for Tilby-style CSV export (document format in package README)

### [platform] Edge & join

- [ ] **ready** — Edge CLI: periodic `--sample` batch mode simulating a day of entries/exits/bounces
- [ ] **ready** — Funnel join module in `packages/analytics` (shared by CLI + future LAN API)
- [ ] **ready** — Small read-only LAN API (Node HTTP) serving latest KPIs from SQLite for portal

### [portal] Operator truth

- [ ] **ready** — Portal env flag `VITE_PILOT_API_URL` → fetch KPIs when set; fallback to `demoStore.ts`
- [ ] **ready** — Overview page: show data source badge (`live` vs `illustrative`)

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

- [x] **done** — M0: TSX docs site + commercial viability pages + CI (`pnpm run ci`)
- [x] **done** — Event schemas + SQLite schema + inbox sync path
- [x] **done** — Sales portal with illustrative Milano boutique data + presenter guides
- [x] **done** — Bootstrap script: sample edge + POS → sync → report
- [x] **done** — Docs deploy workflows (GitHub Pages + optional Vercel)
- [x] **done** — Add unit tests for `packages/analytics` (`dailySummary`, `syncInbox`, schema inserts); wired into `pnpm run ci` via a new `test` step
