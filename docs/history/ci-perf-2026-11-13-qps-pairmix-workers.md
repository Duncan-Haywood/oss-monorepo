# Perf, 2026-11-13: quick-pick-survey pairMix on worker threads, suite now CPU-bound

Perf track, prompt 0. Shipped: the pair-mix simulation's six independent
seeded runs (2 selectors x 3 seeds) run on worker threads
(`pairMixParallel`, `ventures/quick-pick-survey/src/lib/pairMix.ts`). The
MEASURE output is byte-identical. The simulation suite drops from about 102 s
to about 94 s wall in this container (two runs each), which is where its CPU
floor is. Item 1 of "Not changed" in
[`ci-perf-2026-11-13-qps-cell-workers.md`](ci-perf-2026-11-13-qps-cell-workers.md).

## Why this item

Both open perf backlog items (P063, P064) touch workflow files and wait for
the owner. `python3 platform/ci/ci_profile.py --runs 300 --steps 30`
(2026-11-13, 16:48Z to 17:07Z): after the Portfolio Pages steps (many perf
passes this month) and the ventures-tests steps, the next single step was
**quick-pick-survey CI / Simulation tests** (124 s in the one run in the window).
Today's earlier run had named pairMix as the new floor.

## Before

`MEASURE_OUT=<file> npx vitest run --config vitest.simulations.config.ts
--reporter=json --outputFile=<json>` in `ventures/quick-pick-survey`, wrapped
in bash `time`. 4 cores, node 22.23.4, after `npm ci`. 55/55 tests pass.

- Run 1: wall **104.9 s**, user 346.6 s.
- Run 2 (same command, MEASURE to /dev/null): wall **99.6 s**, user 356.9 s.

This container is slower than the one the earlier run used (that run saw
127 s before and 66 s after with about 230 s user). Compare within a run's
own numbers, not across docs.

Per file, run 1 (from the JSON report's start and end times):

| file | s |
|---|---:|
| pairMix | 88.8 |
| poolCapDeep4000 | 59.4 |
| poolCapDeep2000 | 22.5 |
| poolCap | 17.7 |
| biasedRespondent | 16.2 |
| the other ten | 46.7 together |

## Change

- `run` moved, unchanged apart from taking `n` and `budget` as parameters
  (defaulting to `MIX_ITEMS` / `MIX_ANSWERS` as before), from
  `pairMix.simulation.test.ts` into `pairMix.ts`, which a worker can import.
- `pairMixRun(policy, seed, n, budget)` runs one selector ("shipped" or
  "staged", the same two functions as before). `meanRows` is the old
  averaging and rounding, copied verbatim. `pairMix(seeds)` is the serial form.
- `pairMixParallel(seeds)` puts each (selector, seed) job on its own
  `worker_threads` Worker (`pairMix.worker.ts`, loaded with `--import tsx`),
  at most `availableParallelism()` at once, the same pattern as
  `cellParallel`. Workers inherit `process.env`, so the `MIX_*` knobs in
  `docs/INFORMATION-GAIN-SELECTOR.md` still work (checked with
  `MIX_ITEMS=100 MIX_ANSWERS=1000 MIX_SELECTOR=staged MIX_ROUTE=1`).
- The simulation test now awaits `pairMixParallel` and writes the same
  MEASURE line. Its assertion is unchanged.

## Verification

- **Same answers.** All 14 MEASURE lines, sorted: sha256 `5a1e4e33…187da2`
  both before and after.
- **Parity test** `src/lib/pairMix.test.ts` (fast suite, about 2 s): the
  threaded and serial paths must deep-equal at 60 items/1000 answers/2 seeds
  and at 200 items/500 answers/3 seeds. Its preconditions check that shipped
  differs from staged and that seed 11 differs from seed 12. Two mutations in
  the worker both fail it: seed + 1, and the selector swapped.
- `tsc --noEmit` exit 0; `eslint` on the four files exit 0; `npm run
  test:fast` 50 files, 482/482 pass; simulation suite 55/55 pass.

## After

Same command, same container, straight after the before runs:

- Run 1: wall **93.8 s**, user 355.2 s.
- Run 2: wall **94.9 s**, user 359.4 s.

| file | before s | after s |
|---|---:|---:|
| pairMix | 88.8 | 57.1 |
| poolCapDeep4000 | 59.4 | 84.4 |
| poolCapDeep2000 | 22.5 | 30.1 |
| poolCap | 17.7 | 33.0 |
| **suite wall** | **102 (mean of 2)** | **94 (mean of 2)** |

About 8%. The earlier doc predicted "a few seconds, not a halving", and
that is what happened. User time divided by 4 cores is about 89 s, and the
suite now takes 94 s. **The suite is CPU-bound**: every core is busy for
almost the whole run, so moving work between threads cannot save much more.
The per-file times only show which file finished last under contention. The
pool-cap cells are slower here because they now share the cores with pairMix's
workers.

**On CI, one sample shows no change.** The Simulation tests step on this
PR (run for head `09836324`) took 124 s (17:20:26Z to 17:22:30Z). That is the
same as the single pre-change run in the pool window. One sample against one
sample cannot show an 8% saving either way. Check the next few `Simulation tests`
step times before counting any CI saving from this change. If they stay
around 124 s, the CI runner is CPU-bound too and this change saved nothing there.

## Not changed, ranked for the next run

1. **Less CPU, not more threads.** The only lever left in this suite is
   the pair loop's own cost: `exp`, `hypot` and `glickoG` per pair (item 2 of
   both earlier qps docs). A faster form changes the floats, so it needs a
   tolerance argument (for example, MEASURE lines equal to the printed 3
   decimals), not `cmp`.
2. **`live` is rebuilt every answer in pairMix's `run`**: `items.map(...)`
   copies 1,000 objects 3,000 times per run. It is small next to the
   selector, but it is simple to profile with `node --cpu-prof` on one worker.
3. **The CI job runs `npm ci` twice** (verify and simulations). Caching
   `node_modules` would be a workflow (CODEOWNERS) change.
