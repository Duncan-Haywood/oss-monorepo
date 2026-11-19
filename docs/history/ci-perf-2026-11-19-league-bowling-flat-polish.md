# league-schedule-generator: bowling lane polish and walk on flat arrays; bowling.test.mjs 167 s to 98 s (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. `ci_profile.py --runs 600` (2026-11-19 11:18
UTC): `ventures tests` is the second-largest consumer (114.7 job-minutes, its
`node --test` step 81 min over 34 jobs), and league-schedule-generator is the
slowest suite in `venture_suite_times.json` (627 s). Eight perf write-ups name
the league suite; none names its slowest file.

## Reading (before)

`python3 platform/ci/suite_file_times.py league-schedule-generator --jobs 4`,
this 4-core container: 812.1 s summed, 241.9 s wall. Slowest file
`bowling.test.mjs`, 166.6 s (32 tests), then floor-priced 114.3 s, orient
69.1 s. Alone (`node --test --test-reporter=tap bowling.test.mjs`): 148.7 s, of
which

| test | before |
|---|---:|
| 5, every stored SAT assignment ... at the bound | 67.2 s |
| 14, seasons a solver proved out of reach are flagged | 27.3 s |
| 28, 20 teams x 30 weeks with lane limits | 11.9 s |
| 6, the six seasons the week re-solves missed | 8.6 s |

Test 5 runs `assignLanes` twice on each of the 36 stored seasons (65.3 s;
24 teams x 35 weeks the slowest at 5.4 s). `node --cpu-prof`, self time, one
`assignLanes` on 24 x 35 (2,665 ms): the closure that builds each week's cost
matrix inside `polishLanes.resolve` 1,663 ms, `hungarian` 602 ms, the repeat
anneal under 200 ms. A stored season is already at the bound but has repeats,
so the polish spends all its kicks, each a sweep of Hungarian week re-solves;
building the 12 x 12 matrix (`Array.from` with a callback per row, `price()`
calling `off()` four times through nested arrays) cost more than solving it.

Test 14's 35 seasons are proved off the bound, so `walkLanes` always runs its
full 200,000-step budget: `walkLanes` 13.3 s self, `move` 6.4 s, `off` 3.8 s
of 26 s.

## Change (`ventures/league-schedule-generator/bowling.mjs`)

- `polishLanes`: counts, positions, limits and bans in flat typed arrays; one
  reused `Float64Array` cost matrix; `hungarianFlat`, the same algorithm and
  arithmetic as the exported `hungarian` on a flat row-major matrix with
  reused buffers. Every price is the same integer sum, every comparison the
  same, so every sweep and kick takes the same path.
- `walkLanes`: counts, limits and the plan's teams and pairs mirrored in flat
  arrays; `moves` and `bestMoves` are preallocated `Int32Array`s with lengths
  instead of arrays grown per step. The random draws happen in the same order
  (cell, noise, pick) and ties are collected in the same order, so the walk is
  the same walk. The nested `plan` is still updated on each move and copied
  for the best plan, as before.
- The exported `hungarian` and every exported signature are unchanged
  (`bowling-worker.mjs` and the page call the same functions).

## Verification

- A scratch comparison imported the old `bowling.mjs` (a copy taken before
  the edit) and the new one and hashed the JSON of `assignLanes` and the CSV
  and `laneReport` of `bowlingSchedule` on 272 cases: 13 sizes x 3 seeds x
  (default, no anneal with 50 kicks, three teams with lane limits, reversed
  match order), odd leagues 3 to 13 teams, every out-of-reach season up to 12
  teams on seeds 1 and 2, and the walk-rescued sizes (10x30, 16x32, 18x26,
  20x30, 24x34, 8x7, 6x9) with and without limits. Old and new digests
  identical (`10c2331ee0c43f9f`).
- `python3 platform/ci/run_venture_tests.py league-schedule-generator`:
  `ok league-schedule-generator (272.6s, 762 tests)`, site page checks ok.

## Numbers

| | before | after |
|---|---:|---:|
| `assignLanes` 24 x 35, seed 1 (scratch bench) | 2,665 ms | 994 ms |
| test 5 alone (TAP `duration_ms`) | 67.2 s | 38.8 s |
| test 14 workload (35 out-of-reach seasons, scratch bench, wall) | 26.1 s | 16.1 s |
| `bowling.test.mjs` alone (`node --test`) | 148.7 s | 104.9 s* |
| `bowling.test.mjs` in `suite_file_times.py --jobs 4` | 166.6 s | 97.7 s |
| league suite, summed over files / wall (`--jobs 4`) | 812.1 / 241.9 s | 740.8 / 217.8 s |

\* measured after the polish change, before the walk change.

A visitor building a 24-team, 35-week bowling season on the page waits
about a third as long for the lane deal (2.7 s to 1.0 s here).

## Not changed, ranked for the next run

1. **The walk on 4-team seasons** is still most of test 14 (about 16 s): each
   step scans every week for the one or two swaps a 2-pair league allows, and
   the season is proved out of reach, so it can never stop early. Skipping the
   walk when `boundOutOfReach` holds would change the returned season (the
   walk still lowers the off-bound count), so it is a product decision, not a
   same-answers speed-up. A test-side alternative: check the out-of-reach flag
   on a sample of the 35 seasons, which is a coverage decision.
2. **floor-priced.test.mjs** (114 s) is now the slowest league file; its
   twelve 12-team tries are inputs only (`ci-perf-2026-11-17-league-venue-run-local.md`, item 1).
3. **test 28** (20 x 30 with lane limits, 6.5 s after) goes through
   `shapePlan` and the anneal; not profiled.
4. **photo-editing** Python suite: 103.9 s here for 1,442 tests, spread thin
   (slowest module `test_ffmpeg_pipeline` 22.6 s, slowest single test 7.7 s,
   `test_rw2 ... every_shift_and_several_blocks` 7.1 s is the cheapest
   single target).
5. P063 and P064 remain owner-gated.
