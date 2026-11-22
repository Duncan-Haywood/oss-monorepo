# Battery dispatch DP: cost per step computed once per interval (2026-11-22)

Perf track. The "Not changed" list in
`ci-perf-2026-11-18-tile-layout-lean-search.md` (item 3) named
`ventures/demand-charge-interval-analyzer/tou.test.mjs` (2.5 s there) as an
unprofiled suite. No open PR or later history file touched it. `energyDP`
also runs in a visitor's browser, once per month of the tariff comparison
(`tariff.mjs`), so this is page latency as well as CI time.

## Reading

4-core container, node 22.23.

- `node tou.test.mjs`, wall time, median of 7: **3120 ms**.
- `node --cpu-prof tou.test.mjs`, self time: `energyDP` 789 ms (largest
  line), then the LP solver (`direction` 664, `solveBandedLP` 403, `Ax` 282,
  `factor` 200).
- Scratch benchmark (not committed): 12 `energyDP` calls on synthetic
  2,976-interval months, three cap settings, batteries 10 to 43 kW, sha256 of
  `JSON.stringify` of every result. **839, 619, 596 ms**, digest
  `cc0bfda409b5c4d2`.

## What the time was

The backward pass visits every interval t, every stored-energy level i and
every reachable next level j. For each (t, i, j) it recomputed the energy
moved, the grid draw, the export check, the cap excess and the interval's
energy cost. All of those depend on t and on the step k = j - i only, never on
i, so each was computed about N (up to 400) times more often than needed.

## Change (`tou.mjs`, `energyDP`)

1. The grid change for each step k (`-down..up`) is computed once per call
   (`gStep`), with the same expression as before (`k * dE`, then the same
   divide or multiply).
2. Per interval, the cost of each step (`w[k]`: `g*h*pr + ex*PENALTY`, or
   `Infinity` where the step would export) is computed once.
3. The inner loop is then `w[k] + V[j]`, a min-plus scan in the same j order
   with the same strict `<` tie-break.

`Infinity + V[j]` is never `< bestV`, so a step that used to be skipped with
`continue` is still never chosen, and a level with no feasible step still
keeps `bestJ = i`. The sum is evaluated in the same order as the old
`g * h * pr + ex * PENALTY + V[j]`, so every value is bit-identical.

## Verification

- Benchmark digest unchanged: `cc0bfda409b5c4d2` before and after.
- `python3 platform/ci/run_venture_tests.py demand-charge-interval-analyzer`:
  ok, 63 tests.

## After

- Benchmark: **269, 345, 243 ms** (about 2.4x).
- `node tou.test.mjs`, median of 7: **2618 ms** (-500 ms, -16%).
- Profile: `energyDP` self time 330 ms; the LP solver is now the bulk.

## Not changed, ranked for the next run

1. **`lp.mjs` `direction` (~660-850 ms self)**: per-column divisions by
   `x[j]` and `r[j]` in two loops per call. Reciprocals cached once per
   iteration would change rounding (a/b vs a*(1/b)), so it needs a tolerance
   test pinned against the old path, not a `cmp`; worth it only if the
   iteration counts stay the same.
2. **`solveBandedLP` iterative refinement**: up to three `applyNormal` passes
   per solve; a log of how often the loop breaks at k = 0 would say whether
   the band factor is already exact enough.
3. event-seating-chart-optimizer `calc.test.mjs` (3.5 s here, 52 tests) is
   still unprofiled.
4. P063 and P064 remain owner-gated (workflow files).
