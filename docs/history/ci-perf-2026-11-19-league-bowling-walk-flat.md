# league-schedule-generator: the bowling lane walk on flat arrays, same walk; 31 s to 17 s on the out-of-reach seasons (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. `ci_profile.py --runs 600` (2026-11-19 11:18
UTC) puts `ventures tests` second in the pool (114.7 job-minutes, its
`node --test` step 81 min over 34 jobs), and league-schedule-generator is the
slowest suite in `venture_suite_times.json`.

**Overlap.** Another perf session found the same file at the same time and
merged first: PR #17631,
[`ci-perf-2026-11-19-bowling-polish-price.md`](ci-perf-2026-11-19-bowling-polish-price.md)
(the `polishLanes` cost-matrix closure; test 5). This run had also rewritten
`polishLanes`, on flat typed arrays with a buffer-reusing Hungarian. On top of
#17631 it was only about 5% faster (24 teams x 35 weeks: 1,107 / 1,137 ms
main against 1,066 / 1,040 ms), so it was dropped in the merge. What lands
here is the part #17631 did not touch: `walkLanes`.

## Reading

`suite_file_times.py league-schedule-generator --jobs 4`, before either
change: bowling.test.mjs 166.6 s, the slowest of 47 files (812.1 s summed,
241.9 s wall). Per test (TAP `duration_ms`): test 5 (stored SAT seasons)
67.2 s, **test 14 ("seasons a solver proved out of reach are flagged") 27.3
s**, test 28 11.9 s.

Test 14 builds the 35 out-of-reach seasons of up to 12 teams (all 4-team
seasons of 2 to 58 weeks, and a few larger). No deal reaches the bound, so
after the polish `assignLanes` always runs `walkLanes` for its full budget
(`walkStepsFor`: 200,000 steps for these sizes); the walk can still lower the
off-bound count, so it cannot stop early without changing the answer.
`node --cpu-prof` of that workload (26.1 s wall), self time: `walkLanes`
13.3 s, `move` 6.4 s, `off` 3.8 s. Each step rescans every week of the
chosen team through arrays of arrays and grows two fresh move arrays.

## Change (`ventures/league-schedule-generator/bowling.mjs`, `walkLanes` only)

- Counts, limits and bans in flat typed arrays (`team * P + pair`); the
  match-index table `at` flat (`team * W + week`).
- The plan's teams and pairs mirrored in flat `Int32Array`s for the step
  loop; the nested `plan` is still updated on every move and copied for the
  best plan, as before.
- `moves` and `bestMoves` are preallocated `Int32Array`s with lengths, not
  arrays built per step. Ties are collected in the same order (a strictly
  better move resets the list, then is appended, which is what
  `bestMoves = [w, i, j]` did).
- The random draws happen in the same order (cell, noise, pick), and no draw
  is added or skipped, so the walk is the same walk.

## Verification

- Scratch digest of 272 results (JSON of `assignLanes` and the CSV plus
  `laneReport` of `bowlingSchedule`): 13 sizes x 3 seeds x (default, no
  anneal with 50 kicks, three teams with lane limits, reversed match order);
  odd leagues 3 to 13 teams; every out-of-reach season up to 12 teams on seeds
  1 and 2; the walk-rescued sizes 10x30, 16x32, 18x26, 20x30, 24x34, 8x7, 6x9
  with and without limits. The code before both changes, main after #17631,
  and main plus this change all give `10c2331ee0c43f9f`.
- `python3 platform/ci/run_venture_tests.py league-schedule-generator` on the
  merged tree: see the run record's `notes`.

## Numbers

| | main (after #17631) | this change |
|---|---:|---:|
| test-14 workload: 35 out-of-reach seasons, `bowlingSchedule` + `laneReport`, wall | 30.8 s | 16.9 s |

Before either change the same workload took 26.1 s here (main's 30.8 s
reading is within this container's run-to-run noise of it; #17631 did not
touch the walk). A 4-team, 58-week season on the page: about 1.8 s to 1.0 s.

## Not changed, ranked for the next run

1. **The walk on out-of-reach seasons** still runs every step of its budget.
   Stopping once the off-bound count reaches the floor a proof gives would
   keep answers only if that floor were known per season; `bowling-proofs.mjs`
   proves only "not 0". A per-season minimum from the SAT pass would let the
   walk stop as soon as it reaches that minimum, with the same answers.
2. `annealRepeats` (600,000 steps even on stored seasons), #17631's item 2.
3. `floor-priced.test.mjs` (90 to 114 s) is now the slowest league file.
4. **photo-editing** Python suite: 103.9 s here for 1,442 tests, spread thin
   (slowest module `test_ffmpeg_pipeline` 22.6 s; `test_rw2 ...
   every_shift_and_several_blocks` 7.1 s is the cheapest single target).
5. P063 and P064 remain owner-gated.
