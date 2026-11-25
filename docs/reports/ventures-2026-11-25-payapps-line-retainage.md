---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): per-line retainage rates

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#67 (merged).

**What landed.** The roadmap item "Per-line retainage rates". A schedule-of-values line can carry
its own retainage rate (`sov_lines.retainage_pct_bps`, migration 0015; blank follows each
application). The rate is held on that line's work and its stored materials in every application,
so a job-wide cut to 5% at half-way leaves a 0% bond line at 0%. `summary.lineRates` lists those
lines and `lineRatesNote()` words them ("items 1, 2 at 0%; item 7 at 5%") beside lines 5a/5b on the
pay-app page, the PDF and the summary CSV.

**Why a buyer cares.** Subcontracts commonly bill the bond premium (and sometimes other lines)
without retainage. Before this, a sub on PayApps had to fake it with a release on every
application, which shows up on the GC's copy as a release that never happened.

**Design choices to keep.**

- History stays honest: everything is computed on read, so a rate change would rewrite figures the GC
  already has. A line's rate locks (409) once a non-draft application has anything completed, stored
  or held on it (`retainageLockedLines` in `services/payapps/bundle.ts`, read from the computed
  applications, no extra query). A line with nothing billed yet, such as one a change order just
  added, stays open.
- The opening-balance check (mid-job start) uses each line's own rate.
- The retainage-release planner and the QuickBooks invoice already work from per-line held amounts,
  so they needed no change.

**Public side, same day.** `ventures/pay-app-guides/retainage-explained.html` gained "Lines with
their own rate, or none" (worked bond-line example, arithmetic only) and `llms.txt` says so.

**Verification.** Local (private Actions still starts no jobs): `pnpm typecheck`, unit 206 passed,
worker 146 passed including the new `test/worker/line-retainage.test.ts` (default, set, >100% refused, the
pay app/CSV/PDF, the lock and a same-rate save, viewer 403, another company refused), `pnpm build`,
`drizzle-kit check`, `biome ci apps/payapps`, all clean.

**Next, from the roadmap.** Change orders part 3 (flag work billed against a pending change order on
the draft) and History part 2 (log SOV changes, including a line's retainage rate) are the closest
neighbours.
