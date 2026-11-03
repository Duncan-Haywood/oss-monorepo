# quick-pick-survey simulations: follow-up (2026-11-03, perf)

Metric for P061 (`ci_profile.py --runs 200`, 2026-11-03): quick-pick-survey CI is
2 jobs, 15.2 job-min, median 455 s; the heaviest step is the parallel
"Simulation tests" job at 10.5 min. Before the split (2026-11-02, 600 runs):
5 jobs, 39.2 job-min, median 582 s, Test step 21.2 min.

Correction to `ci-perf-2026-11-02-qps-simulations.md`: it said the 41/220-item cells
are "recomputed in four files". I tested that by moving `simulate()` out of
`infoGainPairing.simulation.test.ts` into a plain module that the other five files
import. `npx vitest list --config vitest.simulations.config.ts` listed the same
43 tests before and after, so importing a test file does not register its tests
again. The change was reverted. Do not memoise those cells.

Not changed, ranked for the next run:
1. `poolCap` "500 items, 2000/4000 answers" cells dominate the job (178 s for 2000 locally). Splitting that file's `describe` blocks into separate files would let vitest's file-level parallelism cut wall time to the longest cell.
2. Decide whether the 500/4000 cell belongs in a blocking gate or a scheduled job.
