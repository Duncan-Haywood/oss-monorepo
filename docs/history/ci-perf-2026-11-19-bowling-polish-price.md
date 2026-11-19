# league-schedule-generator: the bowling lane polish prices a week without a closure per cell; bowling.test.mjs 125 s to 71 s (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took the slowest suite in
`platform/ci/venture_suite_times.json` and timed its files afresh.

## Reading

`python3 platform/ci/suite_file_times.py league-schedule-generator --jobs 2`
(this 4-core container): 614.5 s summed over 47 files. The slowest file was
not one the eight earlier league passes looked at:

| file | seconds |
|---|---:|
| bowling.test.mjs | 123.3 |
| floor-priced.test.mjs | 90.6 |
| orient.test.mjs | 57.6 |
| starter.test.mjs | 53.6 |
| carryover.test.mjs | 50.7 |

Inside `bowling.test.mjs` (tap reporter), one test was 54 s: "every stored SAT
assignment is a permutation each week and puts every team at the bound". It
calls `assignLanes` twice for each of the 36 stored seasons in
`bowling-lane-table.mjs`. Even with a stored answer, each call took 1.1 to
2.6 s, because the stored plan still goes through `polishLanes` (iterated week
re-solves) and `cutRepeats` (600,000 annealing steps), as the page does.

`node --cpu-prof` of those 72 calls, self time:

| function | before | after |
|---|---:|---|
| `price` closure in `polishLanes` (bowling.mjs:509) | 57.4% | inlined into `resolve` |
| `hungarian` | 16.9% | 34.3% of a smaller total, then row hoisted |
| `annealRepeats` | 8.5% | |
| `dOff` | 4.9% | 14% of the smaller total, then closed form |

`price(w, t, p)` was called 2 x P x P times per week re-solve, each time
indexing `cnt[t]`, `lo[t]`, `hi[t]`, `ban[t]`, `pos[w-1]`, `pos[w+1]` and
calling `off()` twice.

## Change (`ventures/league-schedule-generator/bowling.mjs`)

1. `polishLanes`' `resolve` builds the cost matrix in plain loops, with each
   team's rows looked up once per match. `off(c + 1) - off(c)` is written as
   `c >= hi ? 1 : c < lo ? -1 : 0`, which is the same value whenever
   `lo <= hi` (always: `laneTargets` gives floor..ceil, or 0..0 for a banned
   cell). Same integers in the same matrix, so `hungarian` returns the same
   columns.
2. `hungarian` reads `cost[i0 - 1]` and `u[i0]` once per row scan instead of
   once per column.
3. `annealRepeats`' `dOff` uses the matching closed forms for one count down
   and one up, instead of four `off()` calls.

## Verification: same answers

A scratch digest script hashes the JSON of 105 results: `assignLanes` on all
36 stored seasons at seeds 1 and 2, the search path (no stored entry) at 6 to
14 teams and 9, 15, 22 weeks, with and without avoided pairs, and
`bowlingCsv(bowlingSchedule(...))` for 5, 9 and 16 teams.

| | digest | time |
|---|---|---:|
| before (copy of the venture) | `a7822659cf03...` | 62.9 s |
| after step 1 | `a7822659cf03...` | 33.4 s |
| after steps 1 to 3 | `a7822659cf03...` | 29.2 s |

`node --test bowling.test.mjs`, alternated, nothing else running:

| run | before | after |
|---|---:|---:|
| 1 | 124.8 s | 71.0 s |
| 2 | 127.7 s | 70.8 s |

(The scratch "before" copy failed tests 13 and 32 only because they read the
page's HTML, which was not copied; the timing is the same work.)

What a visitor's browser does, `bowlingSchedule` for one season, one run each:

| teams, weeks | before | after |
|---|---:|---:|
| 12, 33 | 0.52 s | 0.37 s |
| 20, 30 | 1.09 s | 0.45 s |
| 24, 34 | 4.38 s | 1.53 s |

Whole suite after: `python3 platform/ci/run_venture_tests.py league-schedule-generator` ok, 762 tests, 219.1 s.

## Not changed, ranked for the next run

1. `floor-priced.test.mjs` (90.6 s) stays the next-largest file; the leads
   in `ci-perf-2026-11-17-league-priced-early.md` still apply.
2. `annealRepeats` now holds most of what is left of a stored season (the
   600,000 steps run even when the stored plan already has few repeats).
   Cutting steps changes answers, so it is a product decision, not a perf
   one; an incremental early exit when `best` reaches a proven floor would
   not.
3. `hungarian` on P <= 12 could use typed arrays; worth a profile only after 2.
4. `orient.test.mjs` (57.6 s) and `starter.test.mjs` (53.6 s) have had no
   per-test reading since 2026-11-16.
