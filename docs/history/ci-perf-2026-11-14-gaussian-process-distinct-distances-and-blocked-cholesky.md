# Venture suites: Gaussian-process fits evaluate each distinct distance once and factor four rows at a time (2026-11-14)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner. The previous perf run
(`ci-perf-2026-11-14-ad-spend-frontier-reachable-range.md`, "Not changed" item 4)
named gaussian-process-regression as a suite with no perf pass, so this run
took it. The engine is also what a visitor's browser runs (`worker.mjs`), so
the speed-up reaches the page, not only CI.

## Reading

`node --test <file>`, one file at a time, this container (4 cores, node 22):
`engine.test.mjs` **26.3 s**, `cli.test.mjs` 10.2 s, the rest under 0.2 s.
Inside `engine.test.mjs` three tests were 24.9 s of it: "analyze on the
example with the winning kernel" 10.9 s, "held-out forecast numbers ... still
reproduce" 9.0 s and the scikit-learn start-and-bounds test 5.0 s. All three
fit kernels to the 201-month Mauna Loa example.

## Profile

`node --cpu-prof` on `analyze()` of the example with the
smooth-quasiperiodic kernel (9.3 s), self time per function:
`logMarginal` 3.1 s (the Cholesky factor inlined), `inverseFromCholesky`
2.2 s, the periodic and RBF factor `eval`s 1.3 s + 1.0 s, `kernelPairs` 1.1 s.

Two findings:

1. **Kernel evaluation repeated on equal distances.** The kernel is a function
   of |x_i - x_j| only, and the example's 20,301 pairs take **333 distinct
   distances** (monthly dates). Each likelihood evaluation called `exp`, `sin`
   and `cos` 20,301 times per factor where 333 would do.
2. **Linear algebra bound by loads, not arithmetic.** One n = 201 Cholesky
   took 2.2 to 2.5 ms (about 1.35 M multiply-adds, ~1.8 ns each): each inner
   dot product reloads row j for every row i.

## Change (`ventures/gaussian-process-regression/engine.mjs`)

1. `distinctDistances(D)` (memoised per distance array with a `WeakMap`, since a
   fit reuses one `D` for every evaluation) maps each pair to its distinct
   value, and gives up (`null`, the old per-pair loop) as soon as half the
   pairs would be distinct. `kernelPairs` evaluates each factor and its
   derivatives once per distinct value and gathers. The factor functions are
   deterministic, so every gathered number is the number the per-pair loop
   computed.
2. `cholesky` updates four rows below the diagonal per pass, sharing each load
   of row j; `inverseFromCholesky` does the same in both passes (four rows of
   L^-1 per pass, with a short prologue so each row's sum still starts at its
   own k; four entries of K^-1 per pass). Every entry subtracts or adds its
   products in the same k order from the same start, so the results are
   bit-for-bit the one-row loops'. `inverseFromCholesky` is now exported for the
   test below.

## Verification

- **Bench** (scratch, not committed): sha256 over `JSON.stringify` of
  `analyze()` on the example (smooth-quasiperiodic with two predictions, and
  auto: all seven kernels), `analyze()` on 60 irregular x (per-pair path) and on
  14 points with repeated x, and `fitKernel` plus `logMarginal` (lml, gradient,
  full inverse, alpha) for all seven kernels on 30 irregular points. Hash
  `a3c3a83d530b7519` before, after change 1, and after change 2. Time
  **29.9 s before, 22.2 s after change 1, 15.7 to 16.1 s after both**.
- **CLI**: `node cli.mjs data/mauna-loa-co2-2010-2026.csv` with `--json`,
  `--csv`, no flag, and `--kernel rq --predict 2030-01 --json`, concatenated:
  sha256 `3ee6a8c6...` before and after.
- **New tests** in `engine.test.mjs`:
  - "blocked Cholesky and inverse are bit-for-bit the plain one-row loops
    (every n mod 4)": the old loops written out in the test, compared with
    `deepEqual` for n = 1 to 13, 37 and 64. Fails on a mutant that drops one
    prologue product in the inverse.
  - "a regular grid (repeated distances) gives the same likelihood and
    gradient as a jittered-off grid": 48 monthly points (79 distinct distances
    of 1,176, the distinct path) against the same points moved by under 1e-9
    (1,129 distinct, the per-pair path), all seven kernels, lml and gradient
    within 1e-6 relative. Fails on a mutant that gathers the wrong index.
- `python3 platform/ci/run_venture_tests.py gaussian-process-regression`:
  **25.5 s before, 11.7 s after** (suite alone, wall clock from the shell).
  Profile of the single analyze call: 9.3 s before, 4.8 s after.

## Not changed, ranked for the next run

1. **The linear algebra is still most of a fit** (~70% after this change). A
   gradient evaluation needs the full K^-1 for the trace term, so the inverse
   cannot be dropped; a blocked (level-3) Cholesky would be faster still but
   changes summation order, so it is no longer bit-identical and would need a
   tolerance argument rather than `cmp`.
2. **`cli.test.mjs` 10.2 s before**: spawns the CLI several times, each one a
   full auto fit; it gains from this change but was not profiled on its own.
3. **The upper triangle of K^-1** is written but only the lower triangle and
   the diagonal are read (gradient and leave-one-out). `logMarginal` returns
   `inv` as a full matrix, so it was kept.
4. sprinkler-hydraulic-calc (16.7 s in the last sweep) still has had no perf pass.
5. P063 and P064 remain owner-gated (workflow files).
