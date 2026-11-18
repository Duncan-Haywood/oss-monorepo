# gaussian-process-regression: the gradient reuses the line search's Cholesky factor, and both factor loops work on 2 x 4 tiles (2026-11-18)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner, and PR #17259 (tile-layout-optimizer) was
already open. The ten slowest suites in `venture_suite_times.json` have 8 to 26
perf write-ups each. gaussian-process-regression (17.7 s there) had one
(`ci-perf-2026-11-14-gaussian-process-distinct-distances-and-blocked-cholesky.md`),
and its "not changed" item 1 (the linear algebra is ~70% of a fit) was
still open. The engine also runs in the visitor's browser (`worker.mjs`), so
a faster fit shortens how long the page takes to answer, not only CI.

`suite_file_times.py` printed "no earlier perf pass on record" for this
suite. That is its file-name/title heuristic working as written: the
11-14 write-up's name and title say "gaussian-process", not the full slug.
This file's name carries the slug so the next run sees both passes.

## Reading

This container (4 cores, node 22):

- `suite_file_times.py gaussian-process-regression`: `engine.test.mjs`
  12.3 s, `cli.test.mjs` 5.5 s, the other two 0.1 s each.
- Slowest tests: "analyze on the example with the winning kernel" 4.6 s,
  "held-out forecast numbers ... still reproduce" 4.0 s, the scikit-learn
  start-and-bounds test 2.5 s. Each fits kernels to the 201-month Mauna Loa
  example.
- Scratch bench (`analyze` on the example with smooth-quasiperiodic and two
  predictions, then auto with all seven kernels, then auto on 60 irregular
  points, sha256 over `JSON.stringify` of all three): **15.5 to 15.9 s**,
  hash `09dcbf6830701fe4`.
- `node --cpu-prof` on the bench, self time: `cholesky` 6.4 s,
  `inverseFromCholesky` 4.2 s, `kernelPairs` 2.4 s, `logMarginal` 1.4 s.

## Changes (`ventures/gaussian-process-regression/engine.mjs`)

1. **No second factorisation at an accepted step.** `minimizeBox` evaluates
   the value alone (`fOnly`) at each line-search trial, then calls `fg` at the
   accepted point, which built K again and refactored it. `fitKernel` now
   keeps the last finite `fOnly` result with the exact `logT` array it was
   called with. `fg` passes it to `logMarginal` as `factored` only when it gets
   that same array (reference equality, cleared after each use).
   `logMarginal` then skips the build, Cholesky and solve and uses the stored
   `L`, `alpha` and `lml`. K is a deterministic function of theta, x, y and
   jitter, so these are the numbers it would have computed. The kernel and
   its gradient matrices are still built, because the gradient needs them.
   Bench: 15.5 s to 13.3 s.
2. **`cholesky` factors two columns per pass**, with four rows per inner
   loop: 8 running sums from 6 loads per k, against 4 from 5 before. Column
   j+1's k = j term needs L[i][j], which this pass has just finished, so it is
   subtracted after the loop. That is where the one-column loop puts it
   (last), so every entry runs over the same k order and the result is bit for
   bit the same. Bench: 13.3 s to 12.3 s; `cholesky` self time 6.4 s to 2.9 s.
3. **`inverseFromCholesky` works on 2 x 4 tiles in both passes.** In the
   triangular inverse, row i+1's extra k = i term comes last, as in item 2. In
   the T'T product, row i's extra k = i term comes first, which is also where
   the one-row loop adds it. The odd row and column remainders use the plain
   per-entry loop. Bench: 12.3 s to 10.7 s.

## Verification

- **Bench hash** `09dcbf6830701fe4` before and after each change. Bench time
  15.5 to 15.9 s before, **10.7 s** after.
- **CLI**: `node cli.mjs data/mauna-loa-co2-2010-2026.csv` with `--json`,
  `--csv`, no flag, and `--kernel rq --predict 2030-01 --json`, concatenated:
  sha256 `3ee6a8c6...` before and after (the same hash the 11-14 pass
  recorded). Those four runs take **32.2 s before, 23.0 s after**.
- **Tests** (`engine.test.mjs`):
  - The bit-for-bit test against the plain one-row loops now also runs
    n = 201, the example's size, next to n = 1 to 13, 37 and 64 (every n mod 4,
    both parities). A mutant that drops row i+1's k = i term from the
    triangular inverse fails 12 tests.
  - New: "a gradient call handed the factor of a value-only call at the same
    theta returns what refactoring returns". It runs all kernels on 41
    irregular points and compares the whole result with `deepEqual`.
  - A mutant that drops the `last.logT === logT` guard passes every test.
    In these fits `fg` always comes straight after the accepted `fOnly` on the
    same array. The guard matters on one path: a line search that fails with
    no memory left breaks out of a restart and leaves a rejected trial in
    `last`, and the next restart's first `fg` would then reuse it. No
    fixture reaches that path, so the guard is kept but not pinned by a test.
- `python3 platform/ci/run_venture_tests.py gaussian-process-regression`:
  **12.0 s before, 8.5 s after**, with one more test (49 to 50). Per file
  alone: `engine.test.mjs` 12.3 s to 9.8 s, `cli.test.mjs` 5.5 s to 4.1 s.

## Not changed, ranked for the next run

1. **`inverseFromCholesky` is now the largest cost** (about 4 s of the
   bench, against 2.9 s for `cholesky`). The gradient's trace term needs the
   lower triangle of K^-1, and the upper triangle is still written for
   `leaveOneOut`, which reads only the diagonal. A level-3 blocked algorithm
   would change the summation order, so it would need a tolerance argument
   rather than `cmp`.
2. **`kernelPairs` (2.4 s)** builds the full packed gradient matrices
   (20,301 entries each) from 333 distinct values. Summing W per distinct
   distance first would drop that work, but it changes the summation order
   of the gradient dot products. That also needs a tolerance argument.
3. **The guard in change 1 has no test.** A fixture where the line search
   fails at the end of a restart would pin it.
4. **`suite_file_times.py`'s history match** cannot see a write-up named
   after a shortened product name ("gaussian-process"). Accepting a prefix of
   the slug would fix that, but it risks the false positives the function's
   docstring describes.
5. P063 and P064 are still waiting for the owner (workflow files).
