# CI perf, 2026-11-15: two league-schedule-generator tests, 80.7 s to 18.0 s

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner. The runner-pool reading put "ventures
tests" second (130 job-minutes in the last 600 runs, 103 of them in `node
--test`), and `platform/ci/venture_suite_times.json` put
league-schedule-generator first of 1,365 suites (627 s under load). Its last
perf pass (`ci-perf-2026-11-11-league-schedule-coe-scratch.md`) took it to
130 s, but it has grown since then.

## Reading

Each `*.test.mjs` alone, `node --test --test-reporter=spec <file>`, four at a
time on this 4-core container: floor-priced 175 s, carryover 113 s, starter
74 s, orient 65 s, capped-breaks 65 s, best-of-k 62 s, fuzz-build 45 s,
polish 39 s, frontier-pick 36 s, calc 28 s, squeeze 21 s, the rest under 8 s.

These were the slowest tests (spec reporter, under the same load):

| test | file | s |
|---|---|---:|
| the carry-over-only season ... reaches the proved 94 at 10 teams | carryover | 53.9 |
| floorTable.balanced gives leastBreaks' balanced least ... | floor-priced | 48.7 |
| bestCarryOverRounds keeps its choice with floor-priced seasons ... | floor-priced | 43.5 |
| a pool of any size, finishing in any order ... | best-of-k | 37.3 |
| capped tries reach the few-breaks end ... | capped-breaks | 34.0 |
| carryOverFloorPriced: seasons into the widest gap ... | floor-priced | 33.6 |
| carryOverFloorPriced runs at up to 26 teams in the page, not at 27 | floor-priced | 22.4 |

## Two findings

**The carry-over-only test searched the same ten tries six times.** It called
`bestCarryOverRounds(10, { tries: 8, capped: 2, effort: 0.5 })` six times:
`pick` 0, 10 and 40, each with and without `pure`. `carryOverTry` takes neither
`pick` nor `pure`, so the ten searches are the same each time. Only
`combineCarryOverTries` and the one `carryOverPure` season differ. Timed
alone, the ten tries take 8.8 s, the pure season 0.4 s, and one full call
8.1 s.

**The 26-team gate test spent its time growing an array until V8 refused
it.** To show that 22 to 26 teams get past `carryOverFloorPriced`'s size gate,
the test passed fake seasons whose rounds held empty match lists and asserted
a throw. The throw came from `cycleOf` in `floorPricedSingleRounds`. On an
all-zero opponent table the cycle never returns to its start, so the loop
pushed until `RangeError: Invalid array length`. That took 3.0 to 4.6 s per
size, five sizes, plus the memory.

## Change

Only tests changed, and no assertion was removed.

- `carryover.test.mjs`, the carry-over-only season: one full
  `bestCarryOverRounds` call (pick 0, pure) stays. The ten tries and the pure
  season are searched once, and the test asserts that `combineCarryOverTries`
  over them deep-equals that full call's result. The other five seasons are
  `combineCarryOverTries` over the shared tries, with the same `among` rule
  `bestCarryOverRounds` uses. That rule is then tested directly on a small
  search (2 + 1 tries, effort 0.05, about 1 s). At pick 1 the pure season
  (94 / 14, score 108) would beat every try (best 120) if it could be kept,
  so the check is a real one.
- `floor-priced.test.mjs`, the 26-team gate: the fake rounds have
  `matches: null`, so the search throws on its first read of a round
  (`oppFromRounds`). The test now asserts that the error is `/not iterable/`,
  so a throw from somewhere else no longer passes.

## Verification

- Mutation checks, each applied to `carryover.mjs` and then reverted:
  - `among: Infinity` for every pick in `bestCarryOverRounds` fails the
    carry-over-only test (`AssertionError`). I did not check whether the old
    test caught this. Its picks 10 and 40 likely never let the pure season win.
  - `maxTeams = 25` in `carryOverFloorPriced` fails the gate test ("Missing
    expected exception: 26").
- Full suite, `node --test '*.test.mjs'` in the venture directory, nothing else
  running. "Before" was a `git archive` of HEAD `16fa9763a` in the scratchpad;
  its one failure (page.test "related-tool links") happened because the copy
  had no sibling venture folders. "After" was this branch in place.

| | before | after |
|---|---:|---:|
| suite wall | 278.9 s | 252.4 s (−9.5%) |
| suite CPU (user) | 737.6 s | 667.5 s (−9.5%) |
| tests | 520 | 520, all pass |
| carry-over-only season test | 54.4 s | 18.0 s |
| 26-team gate test | 26.2 s | 0.001 s |

## Not changed, ranked for the next run

1. floor-priced "floorTable.balanced gives leastBreaks' balanced least"
   (48 s): 30 `carryOverTry` searches at 8, 9, 12, 13 and 14 teams, then
   `leastBreaks` on each. It already uses the file's memo, so profile how the
   time splits between the tries and `leastBreaks` before changing anything.
2. floor-priced "bestCarryOverRounds keeps its choice with floor-priced
   seasons" (44 s): `plain` and `withF` search the same 8 tries twice, and
   `buildSchedule` searches them a third time. The same sharing as here would
   work, but `buildSchedule` is the subject of the second half.
3. `cycleOf` (`carryover.mjs`) has no bound. A malformed timetable that gets
   past `floorPricedSingleRounds`' length check loops until V8 throws. No
   page input reaches it (timetables come from the searches), but a check
   that every round is a perfect matching would turn a multi-second
   allocation into an immediate error. That is a product change, so it is
   left for a venture run.
4. P063 and P064 are still owner-gated.
