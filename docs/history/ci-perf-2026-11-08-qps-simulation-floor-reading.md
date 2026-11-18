# Perf reading, 2026-11-08: quick-pick-survey simulations, per-file floor

Perf track. Reading only; no code change shipped.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (636 jobs, 691 job-minutes).
Largest consumers: Portfolio Pages 374.7 (`Test the site builder` 231.9, covered by
the `pages-test-perf-*` series), Portfolio validate 66.2 (no step over 3 min in
total), ventures tests 63.7 (P063), quick-pick-survey CI 41.5 (192 s median job).

## Profile

`npx vitest run --config vitest.simulations.config.ts --reporter=json`, 4-core
sandbox, fresh `npm ci --ignore-scripts`: **447 s wall, 758 s user CPU**, 36 tests
pass. Per-file wall time (`endTime - startTime` in the JSON report):

| s | file |
|---:|---|
| 406 | poolCapDeep4000 (one test: 500 items x 4000 answers, 3 policies x 2 seeds) |
| 182 | pairMix |
| 97 | poolCapDeep2000 |
| 21 | poolCap |
| 17 | biasedRespondent |
| 15 | infoGainPairing |
| 12 | hybridDip |

Wall time equals the slowest file, so the job waits on one worker while the other
cores idle (758 s CPU / 4 cores = 190 s would be the floor if it were balanced).

## Why nothing shipped

The cell's assertion compares the median over 2 seeds for `capped` against
`uncapped`. Splitting by seed into separate files would change the assertion
(median of 2 is the larger value, so a per-seed check is weaker or different);
splitting by policy needs the results of two files in one assertion. Running the six
simulations on `worker_threads` keeps the assertion, but the TS `simulate` import
needs a loader inside the worker; that was not attempted this run.

## Not changed (ranked)

1. Run `cell()`'s 6 independent `simulate` calls in parallel (worker threads with a
   TS loader, or a pre-bundled JS copy of `infoGainSim`): expected wall 406 s to
   about 140 s for that file, job wall to about pairMix's 182 s. Same assertions.
2. pairMix (182 s) is next; the same trick applies.
3. CI median job is 192 s against 447 s here, so measure the real runner before
   assuming the whole saving transfers.
