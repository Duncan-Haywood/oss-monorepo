# Perf, 2026-11-17: league-schedule-generator, carry-over counted only as far as the acceptance draw needs

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` (CODEOWNERS, owner-gated), so this run again took the slowest
venture suite in `platform/ci/venture_suite_times.json`:
league-schedule-generator (626.8 s under the four-suite pool).

## Reading

- Whole suite alone, this 4-core container, `node --test --test-reporter=tap
  *.test.mjs`: 222.4 s wall, 562 tests. The slowest test is `floorTable.balanced
  gives leastBreaks' balanced least ...` (`floor-priced.test.mjs`), 39.3 s.
- Phase timing of that test's loop alone: 65.5 s in `carryOverTry` (30 seeded
  searches, 8 to 14 teams), 0.05 s in what the test checks (`leastBreaks`,
  `floorTable`, `balanced`). Under the suite, earlier tests in the file have
  already memoised some of those searches, so it shows 39 s. 9 teams cost more than 13
  (12.7 s against 10.8 s for six tries).
- `node --cpu-prof` of six 9-team tries: `coeCost` 25.5% self and `mixed`
  25.4% (both are `coeOf` inlined into the annealer's cost closures), `anneal`
  13.3%, `teamSwapRounds` 10.1%.

The test's subject is the floor table, but its inputs have to be searched
seasons ("some timetable's balanced least sits above its floor" needs them),
so swapping in cheaper timetables would weaken the test. The search is the
thing to make cheaper, and that also helps people using the page.

## Change

Simulated annealing keeps a move costing `v > cur` when `rand() < exp((cur - v) / T)`,
that is when `v < cur - T ln u` for the draw `u`. Most moves are rejected,
and each was priced in full (`coeOf` over every team's season) only to
compare against that threshold.

- `mulberry32` (calc.mjs) gains `rand.peek()`: the next value, not drawn.
- `anneal` peeks `u`, and passes the limit `cur - T ln u + 1` to cost functions
  that take a second argument. `coeOf` stops when what it has counted plus
  the least the remaining teams can add (n - 2 steps each, one per step)
  passes the limit, and returns that partial sum. The +1 is a rounding margin.
- A move stopped this way has `v > cur`, so it still draws `u` as before and is
  rejected as before. The random stream, every accept/reject decision and the
  result are unchanged. Accepted moves are always priced in full.
- `lowCarryOverCappedRounds`: a move over the break cap was rejected without a
  draw but had its carry-over counted anyway. It is now rejected first, and the
  count below the cap uses the same limit.

Instrumented (not kept): in one 9-team try, 72% of limited `coeOf` calls stop
early, on average after 5.4 of 9 teams (12 teams: 8.0 of 12; 14: 9.8 of 14).

## Verification

- **Byte-identical output.** One SHA-256 over 214 searches (`lowCarryOverRounds`
  n = 3 to 16, two seeds, plain, cyclic, weighted, carried hosts;
  `lowCarryOverDoubleRounds` to 12, plain and weighted; `lowCarryOverCappedRounds`
  default and cyclic with a cap; `carryOverTry` weighted 9 and 12 teams i = 0-5 and
  capped tries i = 8-10 at 7 to 14 teams): `5f30311dce3cc145` on the unchanged
  code and on the new code.
- New `priced-early.test.mjs`: `peek` equals the next draw and draws nothing.
  Four seeded searches (weighted odd, cyclic, capped even, capped odd) are pinned
  to digests taken from the unchanged code. Two seeded faults turn it red: a
  remaining-teams bound of n - 1 per team (too high), and a threshold 2 below
  the exact one (too low).
- Full suite: 564 of 564 pass (562 + the 2 new).

## Before and after

| measure | before | after | how |
|---|---|---|---|
| `floor-priced.test.mjs` alone | 119.9 s, 113.1 s | 110.0 s, 103.4 s | two copies of the venture, runs alternated base/new, nothing else running: **-8.4%** |
| 9 weighted tries (9, 12, 14 teams; i = 0-2) | 29.6, 28.6, 27.9 s | 27.0, 25.9, 27.5 s | alternated, 3 rounds: -6.6% |
| 6 capped tries (9, 12, 14 teams; i = 8, 9) | 6.48, 6.58 s | 5.69, 5.88 s | alternated, 2 rounds: -11% |
| 194-search hash script | 100.4 s | 94.4 s | sequential, one run each |
| whole suite | 222.4 s | 230.8 s | one run each, an hour apart: the suite's run-to-run spread on this box is larger than the change |

The whole-suite number is honest but not a comparison: the suite's tests run
4 files at a time with worker pools inside some, and one run each cannot
resolve an 8% change in the search tests. The alternated single-file A/B can.

## Tried, not kept

- Counting the moved teams first (an order array of the touched teams, then
  the rest: the sum of squared pair counts does not depend on the order).
  Slower than the plain early stop on the 9-team case (2.1-2.3 s against
  1.8-2.1 s per try): the array and the marking cost more than the earlier
  stop saves.
- Starting the count at one moved team (a rotation, no allocation): no
  better than the plain early stop over 3 alternated rounds (27.7, 26.5,
  26.9 s against 27.0, 25.9, 27.5 s).

## Not changed, ranked for the next run

1. The cost closures in `lowCarryOverDoubleRounds` (`within`, `exact`, the
   double `coeCost` with repeats) take one argument, so they still price in
   full. `leg2.coe` could take the same limit. Measure a double-round-robin
   test first.
2. `mixed` with carried hosts (`fixedHostBreaks`) is still unlimited: the
   `Math.min` of two break counts would need both before the limit is known.
3. A tighter remaining-teams bound than one per step (the pair counts already
   seen make some steps cost at least 3). Cheap to try, and the pinned digests
   check it.
