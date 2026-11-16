# wasserstein-distance: one pass over the Sinkhorn kernel per iteration, four rows at a time (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. `platform/ci/venture_suite_times.json`
(2026-11-16 03:01Z) ranks wasserstein-distance 11th of the venture suites at
19.3 s, and no earlier perf note mentions it. The league, shift-roster and
shed suites above it have had dozens of passes.

## Reading

- Per file, `node --test --test-reporter=dot <file>` timed with `date`:
  `engine.test.mjs` **17.4 s**, cli 1.4 s, page 0.17 s, usage 0.16 s.
- Inside `engine.test.mjs`, three tests take 15.9 s of it: the bracket on the
  bundled example for two cost/scaling pairs (6.6 s), the example's `analyze`
  with 99 energy permutations (5.3 s), and the scaled energy statistic
  (4.0 s). Each solves Sinkhorn on the 930 x 930 example (NOAA Central Park
  July nights, 1951-1980 against 1991-2020).
- `node --cpu-prof` on two `analyze` calls (self time per function):
  `step` 7.3 s, `logG` 0.47 s, `columnError` 0.39 s, energy `stat` 0.33 s,
  `logF` 0.31 s, `build` 0.26 s. The two runs take 1,720 and 390 iterations,
  so one iteration costs about 2.8 ms for 2 x 865k multiply-adds, roughly
  1.6 ns each.

## Change (`ventures/wasserstein-distance/engine.mjs`, `sinkhorn`)

An iteration did three passes over the kernel K: `Ku = K^T u` (column sums,
row by row), then `K v` row dot products, then, every tenth iteration,
`columnError` recomputed `K^T u` for the new u.

1. **Fused row pass.** For row i: dot product with v, `u_i = a_i / s`, then
   row i's share of `K^T u` for the next iteration while the row is in
   cache. A `kuFresh` flag keeps that `Ku` for the next `step` and for
   `columnError`. `build()` and the `u.fill(1)` at the end of each eps stage
   clear the flag. If row i underflows, the function returns with
   u_0..u_{i-1} already updated, as the old loop did, and `Ku` is marked
   stale.
   On its own this was within noise (old 6.4/6.4/6.1 s against new
   6.2/6.6/5.9 s on the two bracket runs): the loop is compute-bound, not
   bandwidth-bound.
2. **Four rows at a time**, in the fused pass and in `fillKu`. The four dot
   products share each `v_j` load, and `Ku_j = Ku_j + K0 u0 + K1 u1 + K2 u2
   + K3 u3` reads and writes `Ku_j` once per four rows. JavaScript evaluates
   that sum left to right, the same order as four separate `+=`, and each
   dot product still adds j in ascending order. So every float is the same.
   The leftover rows run unblocked.

## Verification

- Byte-identical: a script hashes the whole `analyze` result (SHA-256 of the
  JSON, with Float64Arrays expanded) for the example under four cost/scaling
  pairs, plus `transport` on three seeded random cloud pairs (50x70,
  200x150, 5x9) at two blurs and both costs. That is 16 hashes plus the
  iteration counts, and all of them match before and after.
- `node --test *.test.mjs` in the venture: all pass.
- Before/after `engine.test.mjs`, alternating with `git stash`, twice:
  old **16.7 / 18.1 s**, new **10.7 / 10.9 s** (-38%).
- The two bracket runs (`ab.mjs`): old 7.4 / 6.1 / 6.2 s, new 5.3 / 4.0 /
  4.2 s.
- What a visitor waits for when they load the example with default settings
  (`analyze({ csv: EXAMPLE_CSV })`, which is what the page runs): old 4.2 /
  4.3 / 4.1 s, new **3.2 / 3.1 / 3.0 s**, same distance (0.32486...) and the
  same 1,340 iterations.
- Profile after: `step` 4.3 s (was 7.3), `columnError` gone.

## Not changed, ranked for the next run

1. **The iterations themselves.** The eps = 0.01 x mean-cost run needs 1,340
   to 1,720 iterations for W1. Greenkhorn, Anderson acceleration or a better
   eps-scaling schedule would cut them, but the bracket values would move,
   and `eval/reference.json` pins them. That is a product change, not a
   speed-up.
2. `logG`/`logF` (0.8 s): `Math.log(a[i])` is recomputed inside the n x m
   loop. Hoisting it is bit-identical and easy, but worth only ~0.3 s.
3. Energy `stat` (0.33 s per 99 permutations on 1,860 points): the label test
   per pair could become two prefix sums per permutation. That is a different
   summation order, so it would need a tolerance test rather than `cmp`.
4. Eight rows instead of four: not tried.
