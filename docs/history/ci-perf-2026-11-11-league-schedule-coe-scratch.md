# CI perf, 2026-11-11: league-schedule-generator suite 251 s to 130 s

Perf track. Both open backlog perf items (P063, P064) touch
`.github/workflows/`, which CODEOWNERS holds for the owner. The previous perf
run's ranked list (`ci-perf-2026-11-11-exact-stock-bitset-dp.md`) named
league-schedule-generator as the slowest venture suite not yet profiled, and
the suite-time table in PR #14910 puts it third of 1,335 (515 s under load).

## Reading

Each `*.test.mjs` alone, `node --test <file>`, this 4-core container (partly
overlapping other work, so an upper bound): best-of-k 272 s, capped-breaks
115 s, carryover 76 s, divisions 70 s, starter 54 s, fuzz-build 33 s, calc
16 s, the other nine under 4 s.

Inside best-of-k one test was 245 s of the file's 272 s: "a pool of any size,
finishing in any order, returns exactly the serial search". For each of
2 `double` × 3 picks it ran the serial 8-try search, then for each of 3 worker
splits ran the same 8 `carryOverTry` calls again: 192 tries of 8-team carry-over
search, where a try depends on neither the pick nor the split.

`node --cpu-prof` on `bestCarryOverRounds(8, { double: true, seed: 4, tries: 4 })`
(6.3 s), self time: `coeOf` 2.08 s, the `exact` cost closure 1.04 s,
`teamSwapRounds` 0.76 s, `anneal` 0.61 s, `mixed` 0.51 s, GC 0.28 s. `coeOf`
runs once per annealing move and allocated a fresh `Int32Array(N * N)` every
call; at 8 teams its loop is about 100 steps, so the allocation was most of
the cost. `teamSwapRounds` built two `Set`s from scratch on every pass of its
loop.

## Change

`ventures/league-schedule-generator/carryover.mjs`:

- `coeOf`: one module-level count table reused across calls; an entry counts
  only when its stamp equals this call's generation, so clearing is O(1).
- `teamSwapRounds`: the two opponent sets became `Uint8Array` marks plus
  arrays in first-seen order (the order the `Set` was iterated in, so the same
  round is added), appended once per new round instead of rebuilt per pass.
- `greedyBreaks`: a reused phase buffer (`fill(-1, 0, N)`) instead of a new
  `Int8Array` per call (small).

Tests (no assertion removed or loosened):

- best-of-k "a pool of any size": each `double` computes its 8 tries once and
  gives every pick × split a `structuredClone` (what a worker message does).
  The serial reference still runs per pick. Mutation check: making
  `combineCarryOverTries` keep arrival order fails this test.
- capped-breaks "weighted tries are unchanged...": the pooled tries are
  computed once outside the pick loop (each pick already got a JSON copy).

## Verification

- Same answers: a script calling `lowCarryOverRounds` (plain, break-weighted,
  cyclic), `lowCarryOverCappedRounds` and `lowCarryOverDoubleRounds` (plain and
  weighted) for 13 league sizes 3 to 20 × 2 seeds, plus two 8-try
  `bestCarryOverRounds`, serialised to JSON: sha256 `f2d25c36...` from the old
  and the new `carryover.mjs` (151,779 bytes each). The random stream is
  untouched; only how the cost is computed changed.
- 427 of 427 tests pass.

## Numbers

Same container, nothing else running, `time node --test '*.test.mjs'` in the
venture directory, before on main at 907d76ae, after with this change.

| | before | after |
|---|---:|---:|
| suite wall | 251 s | 130 s (−48%) |
| suite CPU (user) | 612 s | 360 s (−41%) |
| "a pool of any size" | 245 s* | 38 s |
| `bestCarryOverRounds(8, double, 4 tries)` | 6.3 s | 3.6 s |

\* from the per-file run, which overlapped other work.

## Not changed, ranked for the next run

1. divisions "suggestFairnessWeight reads the league's own travel" (44 s, now
   the suite's longest test): 4 weights × seeds × 3 seasons of full
   `buildDivisions` runs. Real product work, not repetition; profile
   `buildDivisions` before touching the test.
2. The remaining carry-over cost is the O(n R) full recount per annealing move
   (`coeOf`, `hostBreaks`). An incremental delta for the three move types
   would be the next large step; it needs the same hash check.
3. P063 and P064 remain owner-gated.
