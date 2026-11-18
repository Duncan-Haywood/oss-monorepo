# quick-pick-survey simulations: importers re-ran a suite, poolCap split (2026-11-04, perf), backlog P061

**Correction.** `ci-perf-2026-11-03-qps-followup.md` said importing a test file does
not register its tests again, from `vitest list` showing 43 tests. `vitest list`
de-duplicates by name. A real run does not: before this change
`npx vitest run --config vitest.simulations.config.ts` executed **78** tests for 43
unique ones, because `biasedRespondent`, `hybridDip`, `lapseSweep`, `longBudget` and
`poolCap` imported `simulate` from `infoGainPairing.simulation.test.ts`, and each
re-ran that file's `describe` blocks (the 220-item/300-answer cell alone is ~9 s each).

**Change.** `simulate`, `spearman`, `mulberry32` and `Policy` moved to a plain module,
`src/lib/infoGainSim.ts`; the five importers use it. `poolCap.simulation.test.ts` was
split into three files (`poolCapDeep2000`, `poolCapDeep4000`, and the rest) with the
shared cell runner in `poolCapCell.ts`, so vitest's file-level parallelism runs the
500/2000 and 500/4000 cells on separate workers. Assertions are unchanged.

**Measured** (4-core sandbox, `time npx vitest run --config vitest.simulations.config.ts`, same machine, back to back):

| | wall | user CPU | test executions |
|---|---|---|---|
| before (`922e7dce`) | 608 s | 703 s | 78 |
| after | 484 s | 623 s | 48 |

All files pass both times. Unique tests unchanged (43 in `vitest list` plus the 5 split cells' describes are the same assertions).

**Not changed / next, ranked.**
1. The 500 items / 4000 answers cell is ~456 s on one worker and is now the floor for the whole job (wall 484 s). Splitting further needs the cell's seeds in separate files (2 seeds: ~230 s each), or moving the cell to a scheduled job (the P061 question).
2. `hybridDip` 30-item cell (~26 s) is the next largest.
