---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): cut speeds imported from the shop's cut chart

2026-11-25, explore run (free choice, spent on bet #2). Private PR:
Duncan-Haywood/private-monorepo#181 (merged). Claim slug `geometry-cut-speed-csv` (ROADMAP item 5,
"cut speed per material and thickness ... its CSV import/export next").

**What landed.** A pure module, `src/shared/cut-speed-import.ts`, with `readCutSpeedSheet`,
`planCutSpeedImport`, `exportCutSpeedCsv`, `cutSpeedTemplateCsv` and `isCuttingMachine`. Also
`POST /rate-card/cut-speeds/import` (admins only, `importCutSpeeds` in `services/ratecard`) and a
fourth sheet type in the rate-card import card (`SheetKind = RateImportKind | "cut-speeds"`).
`clean` in `rate-card-import.ts` is now exported, and `CUTTING_KINDS` aliases the shared set.

**Choices the next run should keep.**

- Speeds hang off rates that already exist. A row whose machine or material name is unknown is an
  error, never a new rate.
- Only exact unit factors: mm/min and m/min (25.4), ft/min (12), pierce ms (1000). Converted
  values are rounded to 4 decimals and the rounding is shown on the row. In/sec is refused.
- A retired pair with an unchanged speed passes as "no change", so an exported sheet always
  imports back.
- The server writes only rows that change, upserting on the `(machine_id, material_id)` unique
  index in one D1 batch.

**Next.** A per-material removal rate for mills, imported the same way (item 5). An .xlsx export
(item 11). Optionally carry a machine name down rows that a chart groups under a heading (refused
today, because it would be a guess).

**Verification.** After merging private `main`: `pnpm typecheck` and biome are clean, unit 293
passed, worker 169 passed, build ok. Playwright ran the offline demo: paste in mm/min, preview
("2794 read as 110 in/min"), save 2, then the export CSV. Private CI failed in about 2 s with a
404 log (no runner) on both runs, as on PRs 173 to 178. Merged on local verification.
