# shift-roster-builder: the cover walk stops on a whole-shift floor (2026-11-16)

Perf track, prompt 0. Metric: wall time of `ventures/shift-roster-builder/own-site-wage.test.mjs`
and of the whole suite.

## Reading

Every `*.test.mjs` file in the venture timed on its own, four at a time on a 4-core container
(`xargs -P4`, `node --test <file>`). The top of the list: `calc.test.mjs` 93.4 s,
`own-site-wage.test.mjs` 69.7 s, `open-sums.test.mjs` 51.3 s, `cg-hardstop.test.mjs` 31.6 s,
`day-lns.test.mjs` 25.4 s, `cover-guide.test.mjs` 25.0 s. `own-site-wage` was in none of the
earlier notes (`ci-perf-2026-11-12-*`, `-11-14-shift-roster-flat-sets.md`,
`-11-16-shift-roster-cg-hardstop-exact-ms.md`).

Run alone with the spec reporter, one test held all of it: "the exact check stays a valid bound
with own rates: proven rosters are never beaten by a brute force", 62.2 s. It prices every way to
pin 3 people (or nobody) to 4 shifts, 256 pins on each of 6 weeks: 1,536 `buildRoster` calls, about
40 ms each.

## Profile

One pin on week 0 (P0, 16 h a week, pinned to a 10 h and a 9 h shift): 252 ms a call, of which
`timings.coverPass` was 185 ms. The roster leaves 9 h open, but `openHoursFloor` said 3 h: its max
flow lets P0's 16 h be split across both shifts, 10 h of one and 6 h of the other. The plateau walk
stops only at that floor, so on every pin that over-books someone's week it ran all twelve passes to
the step limit (`max(60000, 4·4000)·4` steps each) chasing hours no roster can cover.

## Change

`calc.mjs`:

- `wholeShiftCap(lens, cap)`: the largest sum of whole shift lengths within a person's weekly
  minutes (subset sum over the lengths divided by their gcd, each distinct length split 1, 2, 4, ...;
  returns the cap when every eligible shift fits).
- `openHoursFloor(ctx, { wholeShifts: true })` uses it as each person's edge to the sink. A roster
  never splits a shift and the weekly rule counts raw shift minutes (`validWith`, line ~751), so the
  floor stays a valid lower bound and is never below the plain one.
- `coverPass` stops on `max(ctx.openFloor, ctx.wholeShiftFloor)`. The walk keeps its best roster
  only on a strict improvement, which is impossible below a valid floor, so its result is the same.
  `ctx.openFloor` itself is unchanged, so the repair skip (`atFloor`) and everything else read the
  same number as before.

## Verification

- Same answers: old (`git show HEAD:…/calc.mjs`) and new `buildRoster` on the test's 1,536 pins,
  `JSON.stringify` minus `timings`: **0 of 1,536 differ** (old 66.6 s, new 35.4 s for the loop).
  On 135 seeded weeks (3x8, 5x14, 8x24; `exact` false, default, `"auto"`), minus timings and `*ms`
  fields: **0 differ**. The whole-shift floor was strictly higher on 12 of those 135.
- New tests in `open-floor.test.mjs`: on the file's 60 brute-forced weeks the whole-shift floor never
  exceeds the least open hours and never falls below the plain floor; it is higher on 18 and exact on
  31 of the 52 weeks that must leave hours open (the plain floor: 16). The 10 h + 9 h example pins
  3 h plain and 9 h whole. `wholeShiftCap` against a brute-force subset sum on 300 random sets.
- `python3 platform/ci/run_venture_tests.py shift-roster-builder`: ok, 686 tests.

## Numbers

| | before | after | how |
|---|---|---|---|
| the brute-force test | 62.2 s | 33.7 s | `node --test --test-reporter=spec own-site-wage.test.mjs`, alone |
| one pinned call (week 0, P0 over-booked) | 252 ms | 38.5 ms | mean of 50 calls |
| whole suite | 235.4 s (684 tests) | 220.6 s (686 tests) | `run_venture_tests.py shift-roster-builder`, 4 jobs, same container |

The suite's wall time moves less than the file's because it runs four files at once and
`calc.test.mjs` (about 93 s) sets the critical path; the CPU saved is about 28 s.

## Not changed, ranked for the next run

1. **`anneal` (16.9 s) and `eject` (11.2 s) on the same 1,536 pins**, now the rest of the test's
   33.7 s. Both are fixed-step searches on weeks where each shift has at most one eligible person.
   Neither has an exact stop: a score floor for anneal would be one. Skipping them on a "tiny state
   space" would change outputs, so it is a product decision, not a speed-up.
2. **Use the whole-shift floor as `ctx.openFloor`.** It would skip the cover repair on more weeks and
   could help the exact search (README: "Next: a tighter bound on the open-hours floor"). The repair
   can still find equal hours with fewer open shifts, so that changes answers; it needs a bench.
3. The same subset-sum tightening for the **per-day cap** (`min(chain, dailyCap)`). Not measured.
4. `calc.test.mjs` (93 s) remains the suite's critical path; see
   `ci-perf-2026-11-16-shift-roster-cg-hardstop-exact-ms.md`, item 1.
5. P063 and P064 remain owner-gated (workflow files).
