# Product maturity — Retail Pilot Intel

**Last updated:** 2026-08-25 (live Overview KPIs)

Score each subsystem **0–5**. Do not inflate. Marketing may demo **working software only**; illustrative portal data is Phase 1 until wired to SQLite.

## Maturity model

| Phase | Meaning | Examples in repo |
|-------|---------|------------------|
| **0** | Narrative only | Commercial viability TSX reports, strategy copy without code path |
| **1** | Interactive prototype / mock data | Portal `demoStore.ts`, docs pages, sample CLIs (`--sample`) |
| **2** | Functional MVP — real integrations in one vertical slice | SQLite ingest + sync + CLI report; one live POS adapter; RTSP door counts |
| **3** | Pilot-live — store LAN deploy, observability, owner trust | Edge box + DPIA signed; 7-day stable funnel; portal reads real DB |
| **4** | Growth — repeatable GTM, multi-store, experiments at scale | 5 paying stores; experiment registry with € lift; second POS vendor |
| **5** | Scale — EU expansion, partner install kit, self-serve onboarding | Localized GTM; installer playbook; remote provisioning |

## Milestone gates (value-gated)

| Milestone | ROI focus | Exit criteria | Status |
|-----------|-----------|---------------|--------|
| **M0 — Repo & docs** | Enablement | TSX docs + CI green; ROI page agreed | **Done** |
| **M1 — POS ingest** | Rank 1, 3 | Daily revenue & SKU mix in DB; < 60 s lag | **In progress** — stub sample only |
| **M2 — Door counts** | Rank 1, 4, 5 | Replay → hourly entries; ±5% vs manual tally | **Not started** — RTSP stub |
| **M3 — Joined funnel** | Rank 1–5 | Dashboard KPIs; owner names one € action/week | **Not started** — portal mock |
| **M4 — Pilot live** | Compliance | 7 days stable; DPIA signed; no PII retention | **Not started** |
| **M5+ — Zones / window** | Rank 7–8 | Only if M3 plateaus | **Deferred** |

## Subsystem maturity table

| Subsystem | Phase | Primary surfaces | Blocker to next phase |
|-----------|-------|------------------|------------------------|
| Event schemas | 2 | `packages/schemas`, JSON Schema | — |
| Edge vision ingest | 1 | `packages/edge` | No RTSP/CV pipeline; `--sample` only |
| POS connector | 1 | `packages/pos` | No vendor adapter (Tilby/Lightspeed-class) |
| Analytics / SQLite | 2 | `packages/analytics`, `data/pilot.db` | No hourly rollups; no revenue/entrant join in API |
| Funnel join & KPIs | 1 | `report.ts` daily summary only | No revenue-per-entrant; no SKU join |
| Store operator portal | 2 | `apps/portal`, `demoStore.ts`, `VITE_PILOT_API_URL` | Hourly/SKU series still illustrative; live path is daily joined KPIs |
| Docs site | 2 | `apps/docs` | Canonical TSX; CI + deploy workflows |
| Sales / GTM narrative | 2 | `/gtm`, `/demo`, `/business-plan` | Needs live pilot case study |
| Experiments registry | 0 | Roadmap only | No code |
| Desirability gap | 0 | Portal mock SKU insights | Needs touch events or POS-only proxy |
| Privacy / DPIA kit | 1 | `/privacy` | No signed artifact workflow |
| Remote install / edge deploy | 0 | Architecture diagram | No compose kit for store LAN |
| Unit tests | 0 | — | No `tests/*.test.ts` yet |
| CI pipeline | 2 | `scripts/ci.ts`, `.github/workflows/ci.yml` | Full `pnpm run ci` on PR |

## Launch readiness (pilot M4 trajectory)

Answer each **yes/no** at the start of every orchestrator run:

| Gate | Question | Current |
|------|----------|---------|
| **G1 — Revenue side** | Can we ingest real POS sales into SQLite within 60 s? | No (stub) |
| **G2 — Traffic side** | Can we count door entries from edge without cloud video? | No (stub) |
| **G3 — Joined KPIs** | Do conversion % and revenue/entrant come from the same DB? | Yes (daily CLI + `serve-kpis`; hourly still missing) |
| **G4 — Owner UI** | Does the operator portal show live KPIs, not hardcoded arrays? | Partial (`VITE_PILOT_API_URL` + `serve-kpis`; unset keeps illustrative) |
| **G5 — Weekly € action** | Can the system surface one ranked owner action per week? | No |
| **G6 — Trust** | DPIA template + retention defaults documented and deployable? | Partial (docs only) |
| **G7 — GTM proof** | Can sales demo a path from portal → install kit → first KPI? | Partial (mock portal) |
| **G8 — Repeatability** | Second store install without founder on-site? | No |

**Rule:** Do not sell Phase 3 until G1–G4 are green at the design-partner store.
