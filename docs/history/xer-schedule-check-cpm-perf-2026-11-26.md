# XER Schedule Check: working time counted by weeks, not days (2026-11-26)

Perf track, version 0, item 4 ("what visitors wait on"), on a construction
product's front door. The backlog had no agent-workable perf item (P063, P064,
P086 are owner rows). Earlier passes on this venture
(`xer-schedule-check-page-perf-2026-11-23.md`) measured page weight; nobody had
timed the engine on a large schedule.

## Reading (before)

Input: the invented example schedule (`example.mjs`, 22 activities, 25 links)
copied N times into one XER, each copy's demolition SS+2d after the previous
copy's layout and its punch list FS after the previous punch list, so the job
runs long (generator: a 30-line script replicating `parseXer(EXAMPLE_XER)` rows
with shifted ids; no real data). Timed with `node cli.mjs big.xer --json`,
best of three, Node 22.23.5, 4-core cloud container.

| activities | links | before | after |
|---:|---:|---:|---:|
| 2,200 | 2,698 | 329 ms | 189 ms |
| 8,800 | 10,798 | 3,229 ms | 479 ms |
| 17,600 | 21,598 | 11,949 ms | 882 ms |

Before, 4x the activities cost 9.8x the time. `node --cpu-prof` on 8,800
activities: `Calendar.workBetween` (`calendar.mjs`) 2,566 ms self of about
3,200 ms; next `schedule` 135 ms, `freeFloat` 89 ms, `assess` 67 ms.

`workBetween(t1, t2)` visited every day from t1 to t2. `cpm.mjs` calls it per
activity and per link (free float, remaining work, lag consumed, near-critical
gaps) over spans that reach the project's end, so the cost was activities x
span-in-days.

## Change

For spans over 16 days, `workBetween` clamps the two end days as before and
counts the whole days between from cached sums: full weeks x the week's
minutes, the leftover weekdays from a prefix sum, and the exception days inside
the span (sorted, binary search, prefix sum of exception-minus-normal minutes).
The cache is rebuilt when the week array, the exceptions Map or its size
changes (`calreview.mjs` adds exception days to a calendar copy for its
what-if). A calendar with a period outside 00:00-24:00 or running backwards
(possible only through the constructor, not `fromXer`, whose periods are
clamped and merged) keeps the day walk, where a whole day is not simply the
sum of its periods.

## Verification

- `cmp` of `--json` output before and after on all three sizes: identical.
  `--report`, `--csv` and `--schedule` outputs on 8,800 activities: identical.
- New `workbetween-sums.test.mjs`: 12,000 random spans (some reversed, some
  partial-day) on the example's P6 calendar, a six-day 10 h calendar, the
  24-hour calendar and a weekday calendar with 300 random holidays and
  half-days, each equal to the old day walk; an exception added after a first
  call is counted; an out-of-range period falls back to the walk. Planting a
  fault (exception deltas ignoring the normal day) fails 2 of its 3 tests.
- `python3 platform/ci/run_venture_tests.py xer-schedule-check`: 593 tests
  pass in 4.5 s.

## After profile (17,600 activities)

`schedule` 193 ms, `assess` 122 ms, GC 93 ms, `topoOrder` 43 ms, `freeFloat`
39 ms, `buildModel` 36 ms. `workBetween` is no longer in the top eight.

## Not changed, ranked for the next run

1. **`schedule` self time (193 ms at 17,600).** Linear now; profile its inner
   loops before touching, P6-compatibility rules live there.
2. **`assess` (dcma.mjs, 122 ms).** Not profiled.
3. **`addWork` / `subWork` / `nextStart` still walk days.** They return at the
   first day that holds the remaining work, so they cost the duration, not the
   project span; they did not show in the profile. A long lag or a long
   activity on a calendar with few working days is the case to time.
4. **The heavier analyses** (risk Monte Carlo, levelling, drag, windows) call
   `schedule` many times; they gain the same factor per run but were not
   timed here. Drag at `maxRuns = 800` on a large file is the next to measure.
5. P063, P064 and P086 remain owner rows.
