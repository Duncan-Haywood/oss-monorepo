# quick-pick-survey: the information selector skips pairs that cannot win (2026-11-15)

Perf track, prompt 0. The two open perf backlog items (P063, P064) touch
workflow files and wait for the owner, so this run took the pool reading
instead.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-15 00:25Z to
01:15Z): 584 jobs, 606.4 job-minutes. `quick-pick-survey CI`: 6 jobs, 21.0
min; its heaviest step is "Simulation tests" (5.7 min, about 57 s a job).
Larger consumers were taken: Portfolio Pages and ventures-tests (many runs
this month), open-tennis-robots CAD (`ci-perf-2026-11-14-open-tennis-hose-curve.md`).

## Before

`npx vitest run --config vitest.simulations.config.ts` in
`ventures/quick-pick-survey`, 4 cores, node 22, after `npm ci`. 55/55 pass.
Wall **77 s** (a second run: 87 s), user about 300 s. The floor was
`poolCapDeep4000` (59 s), then `pairMix` (45 s), `poolCapDeep2000` (25 s).

One seeded run of the 4000-answer cell (`cellRun(policy, 500, 4000, 1000)`
under `node --import tsx`): shipped 1.2 s, capped 25.9 s, uncapped 34.4 s.
`node --cpu-prof` of a capped run: 2.91 s of 3.74 s self time in
`selectNextPairByInformation`, the O(n^2) pair loop (125k pairs per answer at
500 items). Everything that depends on one item was already hoisted on
2026-11-12 (`ci-perf-2026-11-12-qps-information-selector-loop.md`); what was
left per pair is one `exp`, one `hypot`, one `sqrt` and two divisions. That
doc's "not changed" item 2 said a faster form of those would change the
floats and need a tolerance argument.

## Change

`src/lib/pairing.ts`, `selectNextPairByInformation`: skip pairs that cannot
beat the best score so far, without changing any float that is computed.

- Tier 1, per item: p(1 - p) <= 1/4 and g^2 <= 1, so an item's drop is at most
  phi^2 - 1/(1/phi^2 + 1/4) whoever it meets. Penalty <= 1, noise < 1 + 1e-6.
- Tier 2, per pair: the pair's g is at least g(max phi in the pool), and
  p(1 - p) = 1/(2 + 2 cosh x) <= 1/(4 + x^2). So the spread is at most
  1/(4 + (gMin mu)^2), and each drop rises with the spread.
- Both bounds carry an absolute margin of 1e-9 phi^2 per drop and a relative
  1e-9, against float error near 1e-16.
- A skipped pair still draws its `rand()`, in the same order, so the stream and
  every later pick are unchanged.

Skip rate, uncapped 500-item 4000-answer run: tier 1 alone skipped 48% of
pairs (143M of 299M). With tier 2 the run went from 34.4 s to 8.0 s.

## Verification

- `pairingInformationParity.test.ts` already pinned the loop to the original
  per-pair form on random pools. Its ratings are coarse, so the skip rarely
  fires there. New: every pick of four seeded simulated runs (60 to 450 items,
  120 to 400 answers, lapse 0.1, the conflict and coverage options), with the
  stream recorded and replayed so the new loop must make the same pick from the
  same draws and draw exactly as many.
- Red check: with tier 2's bound made too small (`4 + 4x^2`), 7 tests fail,
  the four new ones included. Restored, all pass.
- Simulation suite before and after with `MEASURE_OUT`: the 14 MEASURE lines,
  sorted, are byte-identical (`cmp`).
- `npm run test:fast` passes, as do `tsc --noEmit` and eslint on both files.

## After

| | before | after |
|---|---:|---:|
| simulation suite wall | 77 s | **33 s** |
| poolCapDeep4000 | 59 s | 19 s |
| pairMix | 45 s | 14 s |
| poolCapDeep2000 | 25 s | 5 s |
| one capped 4000-answer run | 25.9 s | 6.3 s |
| one uncapped 4000-answer run | 34.4 s | 8.0 s |

The live route runs the same function. `pairLatency.test.ts` (median of 15):
500 items at 300 answers, 9.6 to 3.2 ms; 220 items, 2.8 to 0.8 ms.

## Not changed, ranked for the next run

1. **`poolCap` 3000-item cell (13.6 s)** is now the longest test besides
   `poolCapDeep4000`. It runs the capped selector (400-item pool) and the shipped
   one; the bound helps it less because the cap keeps only the highest-rd items,
   whose bounds are close together.
2. **A sorted pass**: visiting pairs in falling `dropCap` order would let a
   row stop at the first pair under the bound. It changes the visit order, so
   ties and the rand() order would need a separate argument. Not worth it at
   33 s.
3. **The suite now sits near its CPU floor**: about 120 s of user time over 4
   cores. vitest workers and the cell's worker threads share the cores.
4. P063 and P064 remain owner-gated (workflow files).
