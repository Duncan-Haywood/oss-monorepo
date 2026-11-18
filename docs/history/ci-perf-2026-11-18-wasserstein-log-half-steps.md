# wasserstein-distance: log-domain half-steps read C by rows and take each log once (2026-11-18)

Perf track, prompt 0. Both open perf backlog items (P063 ventures-tests
checkout, P064 shed stamp cache) touch `.github/` and wait for the owner.
`python3 platform/ci/ci_profile.py --runs 300` (06:22 to 06:37 UTC) put
"ventures tests" second in the pool (47.8 job-minutes in 16 jobs); the top
three venture suites in `venture_suite_times.json` (league, shift-roster,
shed) each have 17 to 27 perf write-ups and were touched today, so this run
took item 2 of the "not changed" list in
`ci-perf-2026-11-16-wasserstein-sinkhorn-fused-rows.md`.

## Reading

`node --cpu-prof` on three `analyze` calls on the bundled example (930 x 930,
Central Park July temperatures; scale none/euclidean, sd/sqeuclidean,
sd/euclidean; no permutations), self time per function, two runs each:

| | `step` | `logG` | `logF` | `build` |
|---|---:|---:|---:|---:|
| before | 5.75, 5.89 s | 0.86, 1.05 s | 0.61, 0.77 s | 0.47, 0.55 s |
| after | 5.65, 5.69 s | 0.45, 0.48 s | 0.41, 0.41 s | 0.45, 0.46 s |

`logG` + `logF` went from 1.47 to 1.82 s to 0.86 to 0.88 s. Sinkhorn runs
them twice at the start of every eps-scaling stage and after every underflow.

## Change (`ventures/wasserstein-distance/engine.mjs`, `sinkhorn`)

1. `Math.log(a[i])` and `Math.log(b[j])` were evaluated inside the n x m
   loops; they are now two arrays computed once per call.
2. `logG` walked C a column at a time (each step a stride of m x 8 bytes
   through a 6.9 MB matrix). It now reads C row by row, staging each term in
   K and keeping a running max per column, then sums `exp(t - max)` row by
   row. K is free at that point: every call to `logG` is followed by
   `build()`, which rewrites all of K. Each column's max and sum still run
   over i ascending, so g is bit-identical.

## Verification

- Identity: a script hashed (sha256 of the JSON, typed arrays expanded) the
  full output of three `analyze` calls on the example (one with 49 energy
  permutations) and 24 `transport` calls on seeded random clouds (sizes
  40x55x2, 7x3x1, 120x90x3; blur 0.5 to 0.0002, which exercises the
  underflow recovery; both costs). Before and after: the same digest,
  `f127a392...e83cc2`.
- `python3 platform/ci/run_venture_tests.py wasserstein-distance`: ok, 43
  tests.
- `node --test engine.test.mjs`, wall time with `date +%s.%N`, alternating
  with `git stash`, five pairs: before 13.37, 12.96, 12.23, 12.20, 12.20 s
  (median **12.23 s**); after 11.70, 11.84, 11.17, 11.39, 11.01 s (median
  **11.39 s**), 7% off. The page runs the same `analyze`, so a visitor's
  example run drops by about the same share.

## Tried and dropped

Eight rows per block in `step` (item 4 of the last list). It is
bit-identical (the left-associated `Ku[j] + K0 u0 + ... + K7 u7` adds in the
same order as two four-row blocks), but two profiles gave `step` 5.36 and
6.91 s against 5.85 and 5.39 s for four rows: no reliable gain, so the
simpler code stays.

## Not changed, ranked for the next run

1. **The iterations** (1,340 to 1,720 for W1 at blur 0.01): still the bulk
   (`step` about 5.7 s of 7.5 s). Any faster scheme moves the bracket values
   pinned in `eval/reference.json`; a product change, not a speed-up.
2. **Energy `stat`** (about 0.5 s per 99 permutations): prefix sums per
   permutation, under a tolerance test rather than a hash.
3. **`build`** (0.45 s): one `exp` per entry per rebuild; a division by `e`
   could become a multiplication by `1/e`, but that changes bits.
4. gaussian-process-regression `cli.test.mjs` (5.9 s for one fit of 201
   points): `cholesky` 2.3 s and `inverseFromCholesky` 1.6 s, both already
   blocked four rows at a time and bit-pinned. Fewer evaluations
   (restarts, L-BFGS tolerances) would change the fitted numbers.
