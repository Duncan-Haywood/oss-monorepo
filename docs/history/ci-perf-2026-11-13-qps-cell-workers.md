# Perf, 2026-11-13: quick-pick-survey pool-cap cells on worker threads

Perf track, prompt 0. Shipped: the deep pool-cap simulation cells run their
six independent seeded runs on worker threads (`cellParallel`,
`ventures/quick-pick-survey/src/lib/poolCapCell.ts`). Same numbers, byte for
byte. The simulation suite goes from 127 s to 66 s wall in this container.

## Why this item

Both open perf backlog items (P063, P064) touch workflow files and wait for
the owner. `python3 platform/ci/ci_profile.py --runs 300 --steps 30`
(2026-11-13, morning): after the Portfolio Pages steps and the
ventures-tests step, the largest single step was **quick-pick-survey CI /
Simulation tests**: 7.4 job-minutes over 3 runs, median 155 s. Item 1 of
"Not changed" in `ci-perf-2026-11-12-qps-information-selector-loop.md` was
this exact change: `poolCapDeep4000` was the floor while every other file
had finished.

## Before

`MEASURE_OUT=<file> npx vitest run --config vitest.simulations.config.ts
--reporter=json` in `ventures/quick-pick-survey`, 4 cores, node 22.23, after
`npm ci`. 54/54 tests pass. Wall **127 s** (`time`), user 229 s. Per file
(from the JSON report's start and end times):

| file | s |
|---|---:|
| poolCapDeep4000 | 98.1 |
| pairMix | 49.0 |
| poolCapDeep2000 | 25.4 |
| poolCap | 12.4 |
| biasedRespondent | 11.4 |
| the other ten | 29.4 together |

The CPU summed over files is about 230 s. On 4 cores that allows about 60 s,
but one file ran a single thread for 98 s.

## Change

- `cellRun(policy, items, budget, seed)` is one seeded `simulate` run cut
  down to the two numbers a cell reports (`under(150)` and
  `rankAccuracy`). `cell` is now built from it and gives the same output as
  before.
- `cellParallel(items, budget, n, threads)` runs the same 3 policies x n
  seeds jobs, each on its own `worker_threads` Worker
  (`poolCapCell.worker.ts`, loaded with `--import tsx`, which also resolves
  the `@/` paths). At most `availableParallelism()` run at a time. It takes
  the medians the same way as `cell`.
- `poolCapDeep4000` and `poolCapDeep2000` call `await cellParallel(...)`.
  `poolCap.simulation.test.ts` (12 s) stays single-threaded: it is not the
  floor, and its workers would only compete with the other files.

## Verification

- **Same answers.** All 14 MEASURE lines, sorted, have sha256
  `c07c17bd…3555d5` both before and after. The assertions are unchanged, and
  54/54 tests pass both times.
- **Parity test** `src/lib/poolCapCell.test.ts` (fast suite, 2 s) checks
  that `cellParallel` deep-equals `cell` at 40 items/120 answers/3 seeds and
  at 450 items/60 answers/2 seeds. As a precondition it checks that shipped
  and capped differ, so a mislabelled run would show. Two mutations, both
  caught: worker seed + 1, and the shipped/capped labels swapped. The
  capped/uncapped swap is *not* caught at these sizes, because the cap only
  binds past 400 active items, hundreds of answers in. Both paths read the
  same `CELL_POLICIES` table, so that swap would need a typo in `cellParallel`'s
  three `by(...)` labels. The full suite's byte-identical MEASURE lines are
  the check for that one.
- `npm run verify` (typecheck, lint, the default vitest config with the
  simulations, build): exit 0, 64 files, 519/519 tests.

## After

Same command, same container, run straight after the before run: wall **66 s**,
user 233 s (the same work, spread out).

| file | before s | after s |
|---|---:|---:|
| poolCapDeep4000 | 98.1 | 46.7 |
| pairMix | 49.0 | 65.1 |
| poolCapDeep2000 | 25.4 | 16.6 |
| poolCap | 12.4 | 17.1 |
| **suite wall** | **127** | **66** |

pairMix got slower (49 to 65 s) because it now shares the cores with the
cell workers. It is the new floor. These are single runs: expect a few
seconds of noise. On CI the step's median was 155 s against 127 s here, so
check the next few `Simulation tests` step times before reading the CI saving
as 2x.

## Not changed, ranked for the next run

1. **pairMix is the floor** (65 s under contention). Its staged and shipped
   runs (`run(policy, seed)`) are independent, so the same worker pattern
   applies. With 4 cores, the CPU sum (about 230 s) puts the floor near 60 s,
   so expect a few seconds, not a halving.
2. **The pair loop's `exp`, `hypot` and `glickoG` per pair** (item 2 of the
   11-12 doc) are now the real CPU cost. A faster form changes the floats, so
   it needs a tolerance argument, not `cmp`.
3. **The CI job runs `npm ci` twice** (verify and simulations, 2.4 and 2.0
   job-minutes). Caching `node_modules` would be a workflow (CODEOWNERS)
   change.
