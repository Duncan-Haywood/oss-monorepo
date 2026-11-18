# Perf, 2026-11-17: rrule-explainer tests only the days a rule can match

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` (owner-gated), so this run took the untouched mid tier of
`platform/ci/venture_suite_times.json`, as the 2026-11-16 note
(`ci-perf-2026-11-16-trial-conversion-bootstrap-histogram.md`, "ranked next" 2)
suggested: rrule-explainer, 12.1 s under the four-suite pool.

## Reading

- `python3 platform/ci/suite_file_times.py rrule-explainer`, idle 4-core
  container: **13.2 s** summed (rrule.diff.test.mjs 7.2 s, rrule.test.mjs 5.8 s,
  the rest 0.3 s).
- `node --cpu-prof rrule.diff.test.mjs`: `dayMatches` 4.0 s self, `ruleTimes`
  1.9 s, of 7.3 s.
- Per-case timing of the 3,200 differential expansions (1,600 dateutil
  fixtures x two flavours): 6.9 s total, **6.3 s of it in the 456 rules that
  produce no dates**. A rule that never matches (BYMONTH=2;BYMONTHDAY=30,
  SA intersected with 1TU) searches 400 x INTERVAL years before saying so,
  calling `dayMatches` on every day of every period: about 146,000 calls each.

## Change (`ventures/rrule-explainer/rrule.mjs`)

1. **Candidate days per period.** The YEARLY and MONTHLY branches of
   `ruleTimes` used to test every day of the year or month. They now test
   `yearCandidates` / `monthCandidates`: the shortest of the lists BYYEARDAY,
   BYWEEKNO (in the day's own week-year, y - 1 to y + 1), BYMONTH/BYMONTHDAY
   and BYDAY (ordinals counted within the month or year, as `dayMatches`
   counts them; dateutil's intersect reading kept) leave open. Each is a
   superset of the days that pass, and `dayMatches` still checks every filter,
   so the set of dates is unchanged. WEEKLY drops days whose weekday BYDAY
   excludes.
2. **Sub-daily steps** (the 3,000,000-step search is the product's cap and
   stays): EXDATE lookups use numeric sets instead of building two strings per
   candidate; a SECONDLY step with no BYSETPOS yields directly; HOURLY and
   MINUTELY steps reuse a minute/second offset list built once instead of
   `product()` + sort per step; `applySetPos` with one position indexes
   directly instead of a Set, spread and sort.

## Verification

- **Byte-identical output**, old file (`git show HEAD:...`) against new:
  - 10,536 `expand()` results (fixture rules plus MONTHLY/YEARLY swaps, both
    flavours, both DTSTART modes, limit 40) hash to the same SHA-256
    (`553abc46...`) before and after.
  - 4,000 random `analyze()` inputs across all seven frequencies with
    BYHOUR/BYMINUTE/BYSECOND/BYSETPOS/BYDAY/BYMONTH/BYMONTHDAY, EXDATE
    (date and date-time), three DTSTART forms and "Show from": 0 differ.
- **New test** `rrule.scan.test.mjs` (0.7 s): 300 random MONTHLY/YEARLY rules
  x both BYDAY readings x 30 years; the candidates filtered by `dayMatches`
  equal a scan of every day, and are in order. Seeded mutations (negative
  BYWEEKNO off by one, negative ordinal BYDAY off by a week, negative
  BYMONTHDAY bound) each fail it.
- `python3 platform/ci/run_venture_tests.py rrule-explainer`: ok, 59 tests.

## After

| | before | after |
|---|---:|---:|
| suite, `suite_file_times.py` summed | 13.2 s | 5.7 s (incl. the new 0.7 s test) |
| rrule.diff.test.mjs | 7.2 s | 1.3 s |
| rrule.test.mjs | 5.8 s | 3.5 s |
| 3,200 fixture expansions | 6.9 s | 1.3 s |
| 456 never-matching rules | 6.3 s | 1.1 s |

Visitors gain the same: the page runs `rrule.mjs` in the browser, and a rule
with no dates now answers about 5x sooner.

## Not changed, ranked for the next run

1. **The step-cap test** (`a sub-daily search that hits its step cap`, ~1.0 s)
   and the hostile-rules sweep (~2.4 s) spend their time in deliberate
   3,000,000-step searches. Faster means a cheaper per-step generator (yield
   batches instead of one object per step) — a larger refactor of
   `makeStream`/`expand`.
2. **Proving emptiness early**: a sub-daily rule whose BYSETPOS can never pick
   (e.g. `HOURLY;BYSETPOS=-53`) is empty, but saying "no dates" instead of
   "search stopped" changes the output; a product decision, not a perf one.
3. DAILY never-matching rules (0.3 s of the fixture sweep) still test one day
   per period; a DAILY candidate jump would be the next exact cut.
