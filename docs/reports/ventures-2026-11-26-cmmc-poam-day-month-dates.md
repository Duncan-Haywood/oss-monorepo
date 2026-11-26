# CMMC POA&M import: day/month dates (2026-11-26)

Private PR 307 (`Duncan-Haywood/private-monorepo`, claim `claim/cmmc/import-day-month-dates`,
ROADMAP Next #2).

- The POA&M import reads numeric dates in **one order per column**. With no choice it picks
  day/month/year only when some cell can only be day first (31/12/2026, or dots like 31.12.2026)
  and none can only be month first. Otherwise it reads month/day/year, as before. Route field
  `dateOrder` (`mdy`/`dmy`) and the "Dates like 03/04/2026 are" picker overrule it.
- Cells that do not fit the order are listed with a hint and never swapped. A column that mixes
  both orders stays month first, and its day-first rows are listed.
- Code: `readDateOrder`, `numericDateOrder` and `parsePoamDate(cell, order)` in
  `apps/cmmc/src/shared/controls/poam-import.ts`. The preview carries `dates` (order, source,
  numeric count, evidence line).
- The asset and control-status imports do not read dates, so they did not need this. If a future
  import reads dates, reuse `readDateOrder` rather than a per-cell guess.
- Still open from that ROADMAP item: check the header phrases of both imports against a real NIST
  POA&M template once shops send files.
- Verified locally because CI was out of runners (`ci_starvation.py`: no runner assigned):
  typecheck clean; 343 unit and 107 worker tests pass; build ok; cmmc-site tests pass.
