# changepoint-detector: bocpd loop invariants and a typed-array run-length update (2026-11-14)

Perf track run. Both open perf backlog items (P063, P064) change workflow files
and wait for the owner, so the run took the largest venture suite instead.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --top 20` (2026-11-14 04:16Z to
04:34Z): 283 jobs, 280.9 job-minutes, checkout 104.1. "ventures tests" was
the second-largest workflow, 47.6 job-minutes over 15 jobs, 34.1 of them in
"node --test in each touched venture".

The six most-touched ventures over three days, through
`run_venture_tests.py --slowest 15` together on this 4-core sandbox:
changepoint-detector 170.4 s, ai-bookkeeper 67.0, wall-framing-takeoff 60.8,
einvoice-preflight 30.8, sales-agent 13.1, hearth-and-horizon 3.0.

## Profile

The changepoint files one at a time (`xargs -P4`) summed to 428 s, and the
largest was `engine.test.mjs` at 36.8 s, under the one-third-of-the-suite bar
that made splitting worthwhile last time
([`ci-perf-2026-11-13-changepoint-engine-test-split.md`](ci-perf-2026-11-13-changepoint-engine-test-split.md)).
So the lever is inside the engine, not the file layout.

`node --cpu-prof` on the six heaviest files, self time summed per function
(168.5 s of samples): `spawnSync` 33.7 (CLI tests waiting on children),
`pelt` 33.3, **`bocpd` 28.3**, **`logAdd` 12.7**, two cost closures 15.7,
`fisherG` 7.8, GC 7.1, **`lgamma` 5.1**, **`studentLogPdf` 3.6**. Taken
together, bocpd and its helpers were the largest block. `pelt` had already
been hand-tuned twice (2026-11-11 history notes), so this run left it alone.

bocpd's own time was mostly allocation: every step built a `Map` of the whole
posterior (only `P(r = lag + 1)` was read, plus the last step's map at the end),
rebuilt six plain arrays with spread and `push`, then normalised and pruned them
with `map`, `map` and `filter`. `Math.log(H)`, `Math.log1p(-H)` and
`Math.log(prune)` were computed inside the per-run and per-step loops, and
`lgamma` built its nine Lanczos coefficients as a fresh array on every call.

## Change

`ventures/changepoint-detector/engine.mjs`, arithmetic unchanged in value and
order:

- Lanczos coefficients and ½·log 2π at module level.
- `logH`, `log1mH`, `logPrune` computed once per call of `bocpd`.
- Per step, P(r = lag + 1) is noted during the MAP scan (run lengths are
  distinct, so this equals the old `Map.get`, 0 when pruned). After the loop,
  only the final posterior becomes a `Map` for the last `lag` points.
- The new run-length state goes into `Int32Array`/`Float64Array`s of length
  m + 1, filled in one pass. Normalisation and pruning compact in place
  (`!(v > logPrune)` drops exactly what `filter` dropped, NaN included), then
  the second normalisation runs over the survivors, as before.

## Verification

- **Same answers:** a fingerprint script hashed `JSON.stringify` of the
  results for the 75 series in `data/` with at least 10 points, under 10
  configurations: bocpd mean, AR(1) ρ = 0.4, hazard 30 lag 2, Poisson,
  Poisson with dispersion 2.5, NB size 3, NB grid with exposure, a 4-point
  series shorter than lag, `lgamma` at ten points, and full `analyze`. 750
  hashes, `cmp` identical between the old and new engine. JSON numbers
  round-trip, so a one-ulp change would show.
- **Engine time** (the fingerprint run, one process): 100.6 s → 68.0 s (−32%).
- **Suite wall** (`python3 platform/ci/run_venture_tests.py
  changepoint-detector`, alternating after/before, two rounds):
  | round | before | after |
  |---|---:|---:|
  | 1 | 124.0 s | 111.6 s |
  | 2 | 124.2 s | 109.1 s |
  Mean 124.1 → 110.4 s (−11%). Every test passes in all four runs.
- No test, assertion or trigger changed.

(The 170.4 s in the reading above is the same suite running alongside five
others. The 124 s here is the suite alone.)

## Not changed, ranked for the next run

1. **`pelt` (33 s self) and its cost closures (16 s).** They are already
   tight. What is left is how often `analyze` calls them (the trend
   knot-range scan, item 2 of the 11-13 list). Cutting calls changes output,
   so it is a product decision.
2. **`spawnSync` (34 s)**: CLI and worker tests wait on child Node processes.
   Calling the same code in-process would be faster but would stop testing
   the CLI entry point, so it was left.
3. **`logAdd` (12 s)**: two passes per step. Folding the changepoint mass
   into a running max-shifted sum would change rounding. Not exact, not taken.
4. **`studentLogPdf` lgamma pair**: in the mean model `lgamma(α + ½) −
   lgamma(α)` repeats per run length. Memoising it by α is exact but small
   (≈ 8 s of samples across six files).
5. P063 and P064 remain owner-gated.
