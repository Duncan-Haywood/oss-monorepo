# Perf: sprinkler-hydraulic-calc envelope Cholesky (2026-11-14)

Perf track, prompt 0. The two perf backlog items (P063, P064) are owner-gated
workflow edits, so this run took item 4 of the last pass's "not changed" list
(`ci-perf-2026-11-14-gaussian-process-distinct-distances-and-blocked-cholesky.md`):
sprinkler-hydraulic-calc, which had never had a perf pass.

## Reading

- `python3 platform/ci/run_venture_tests.py sprinkler-hydraulic-calc`:
  **14.6 s** wall clock from the shell. `hydraulics.test.mjs` is 0.4 s; one
  test in `page.test.mjs`, "the explainer's numbers match the engine", is
  14.0 s, because it recomputes the grid-against-tree table on
  `how-it-works.html` (`check/grid_vs_tree.mjs`: 28 `analyze` calls on
  ladders up to 10 lines by 8 heads, 102 nodes).
- `node --cpu-prof` over a scratch bench (the table, the example under both
  friction formulas, six 10-line ladders), self time: `cholSolve` 13.7 s of
  20.3 s, the per-link loops 4.3 s (mostly `Map.get` on node names), the
  matrix allocation 1.3 s.

Each `analyze` bisects the source pressure 80 times plus the bracket search,
and each step is a full Newton solve with a dense Cholesky of the junction
matrix: O(m^3/3) per Newton step. The matrix is a graph Laplacian of a
network numbered along its branch lines, so it is almost banded: on the
102-node ladder every row's first nonzero is at most 10 columns left of the
diagonal, apart from one row (the cross-main inlet) that reaches column 0.

## Change (`hydraulics.mjs`)

1. **`cholSolve` works on the envelope.** It records each row's first
   nonzero column, `first[i]`. Fill-in stays inside the envelope, so every
   product the dense loops took left of `max(first[i], first[j])` was an
   exact zero; those are skipped, and so are the `L[i][j]` entries left of
   row i's envelope. The products that remain are subtracted in the same k
   order from the same start, so the result is bit for bit the dense loops'.
   It now factors in place (the matrix is rebuilt every step anyway) and is
   exported for its test.
2. **One matrix per solve.** A `Float64Array(m*m)` with row views, zeroed each
   Newton step, instead of `m` new arrays per step. (A first attempt
   allocated a `Float64Array` per row per step and was slower than the
   original, 23 s on the bench: allocation dominated.)
3. **Link ends looked up once.** Each link carries its junction indices; the
   two per-step loops no longer call `index.get(name)`.

## Verification

- Bench (scratch): sha256 of `JSON.stringify` over the table, the example
  (NFPA and EPANET formulas) and six 10-line ladders: `877055db4e31b76e`
  before and after. **20.3 s before, 4.7 to 5.0 s after.**
- `node cli.mjs --example`, `--example --json`, `node check/grid_vs_tree.mjs`
  and `node check/cases.mjs` concatenated: sha256 `6d19a2c4...` before and
  after.
- New test in `hydraulics.test.mjs`, "envelope Cholesky is bit-for-bit the
  dense loops": the old loops written out, compared with strict `deepEqual`
  (so -0 and 0 differ) on chain, arrowhead and ladder Laplacians, n = 1 to 40.
  A mutant that starts the inner product one column late fails it and four
  existing tests.
- The 61 EPANET agreement cases and the rest of the suite pass unchanged.
- `run_venture_tests.py sprinkler-hydraulic-calc`: **14.6 s before, 3.7 s
  after.**
- In the browser terms a visitor sees (Node, 5-call mean after warm-up): one
  `analyze` of the built-in example 32 ms to 20 ms; of a 10-line, 80-head
  grid, 241 ms to 52 ms.

## Not changed, ranked for the next run

1. **The per-link loop is now the largest cost** (~2.3 s of ~5 s on the
   bench), mostly two `Math.pow` calls per link per Newton step. Computing
   `aq^n` as `aq^(n-1) * aq` would halve them but changes the last bit, so it
   needs a tolerance argument, not `cmp`.
2. **Every bisection step starts Newton cold** (Q = 15 or 20 gpm). Warm
   starting from the previous step's flows would cut Newton iterations
   sharply but changes the converged digits within the 1e-10 tolerance; the
   explainer's printed numbers would need re-checking.
3. **Node numbering**: a reverse Cuthill-McKee order would shrink the envelope
   further for user-drawn networks with long ties, but changes summation
   order.
4. P063 and P064 remain owner-gated (workflow files).
