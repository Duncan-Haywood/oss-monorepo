# CI perf, 2026-11-12: shift-roster-builder's plateau walk stops at a proven floor

Perf track, item 3 ("a venture's test suite"). Both open perf backlog items (P063,
P064) touch `.github/workflows/` and wait for the owner.

## Reading

`docs/reports/venture-suite-times-2026-11-11.md` lists shift-roster-builder as the
fourth-slowest suite (387 s) and the only one of the top four with no perf pass.
Timed alone, file by file (`node --test <file>` in a loop, wall clock, this 4-core
container): **388 s summed**, calc.test.mjs 144 s, cli.test.mjs 70 s, and the seven
`page-*.test.mjs` files 160 s together. The page tests each rebuild the café sample
week about thirty times (one file per guide-page study), and `buildRoster` on that
week took 1.40-1.57 s (5 runs of `buildRoster(sampleStaff, sampleShifts, {})` in one process).

## Profile

`node --cpu-prof` over five sample-week builds, self time summed per function:
`coverPass` 55%, `insertSorted` 17%, `validList` 12%, everything else under 5%.
Line ticks inside `coverPass`:

- 62% on one line, `const T = 0.6 * (0.05 / 0.6) ** (it / iterations)`: a `Math.pow`
  every step, though only an uphill step (one that opens hours) reads it.
- Most of the rest rebuilt the list of open shifts with `forEach` every step, though
  it only changes after an accepted move that changes coverage.
- The walk stops only at 0 open hours. When some hours must stay open, all twelve runs
  go the full `max(60000, 4000 S) * 4` steps (512,000 on the sample).

## Change (`ventures/shift-roster-builder/calc.mjs`)

1. **`openHoursFloor(ctx)`**, a max flow (Dinic) giving the least hours any valid roster
   must leave open: shift minutes go to person-day nodes the person is available for;
   a person-day carries at most its longest rest-respecting chain of shifts (weighted
   interval scheduling on `[start, end + rest)`) and the daily cap; a person at most
   their weekly hours. Every hard rule is only relaxed, so the floor never overstates.
   Under 1 ms on the sample. `coverPass` now stops when its best roster reaches the
   floor. Its only output is the best roster and its open hours, and neither can
   improve below a valid floor, so the result is the same.
2. The temperature is computed only on an uphill step, in `coverPass`, `anneal` and
   `ejectPass` (`T0 * decay ** x` where `decay = T1 / T0`, the same double as before).
3. `coverPass` keeps the open-shift list in index order and rebuilds it only when an
   accepted move changes it, so the RNG picks the same shift.

On the sample week the floor (15 h) is below what the walk reaches (19 h, the exact
search finds the 15), so only 2 and 3 help there. On random weeks the floor exit
carries half the gain.

## Verification

- **Same answers:** `ventures/shift-roster-builder/eval/same-answers.mjs` (committed; its header says how to run it) builds 83 weeks (the sample, the sample with
  balance 50, the sample plus a spare, 80 seeded random weeks of 2-10 people and 4-33
  shifts across five option sets; 59 leave hours open) with the old and new `calc.mjs`
  and compares the whole `buildRoster` result as JSON minus `timings`: **83 of 83 identical.**
- New `open-floor.test.mjs`: on 60 seeded small weeks the floor never exceeds the least
  open hours found by brute force over every assignment (it is exact on 16 of the 52
  that must leave hours open), and the sample's floor is 15.
- All 31 test files pass (`node --test <file>` each); `run_venture_tests.py
  shift-roster-builder ics-calendar-check` passes (ics-calendar-check imports calc.mjs):
  shift-roster-builder 104 s wall with Node's file-level parallelism. That is an after
  number only; the 387 s in the 2026-11-11 table was taken under heavy load, so the two
  are not compared.

## Numbers (same method before and after)

| measure | before | after |
|---|---:|---:|
| `buildRoster` on the café sample, 5 runs | 1.40-1.57 s | 0.96-1.09 s |
| 83-week equivalence set, total solver time | 67.7 s | 19.3 s |
| same, with the floor exit off (loop fixes only) | 67.7 s | 41.2 s |
| suite, files run one by one, summed | 388 s | 250 s |
| calc.test.mjs | 144 s | 99 s |
| cli.test.mjs | 70 s | 46 s |
| page-callout.test.mjs | 42 s | 27 s |

Users of the free scheduler get the same speed-up on every build that leaves hours open.

## Not changed, ranked for the next run

1. `insertSorted` + `validList` (now about 40% of a sample build): each candidate move
   allocates a new list before checking it. A check-before-allocate path for an
   append-only insert could cut both, but `insertSorted` is shared with the pricing oracle;
   pin it with the equivalence harness above.
2. calc.test.mjs is still 99 s: re-take a per-test reading (`--test-reporter=tap`,
   `duration_ms`) now that the solver is faster; the exact-search tests with `exactMs`
   up to 20 s may be bound by the clock, not by work.
3. A stronger floor (a person's consecutive-day limit, history) would let the walk stop
   on more weeks; worth it only with a profile showing weeks where the walk sits at
   floor + 1 h.
