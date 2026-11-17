# CI perf, 2026-11-13: wall-framing-takeoff, knapsack keep rows in one scratch buffer, CLI sweep four at a time

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/` and wait for the owner, so this run took item 2 of "Not
changed" in `ci-perf-2026-11-13-xls-row-padding.md` and item 1 of
`ci-perf-2026-11-12-knapsack-gcd.md`: wall-framing-takeoff's `cli-sweep` and
`mutation-sweep` test files.

## Reading

This 4-core container, node 22.23, nothing else running.

- `node --test cli-sweep.test.mjs`: **12.3 s**. 144 `node cli.mjs` spawns
  (4 plans x 36 flags), one after another, about 85 ms each.
- `node --test mutation-sweep.test.mjs`: **9.2 s**, one thread. It runs
  2,420 hostile single-field plans, and about 2,000 of them go through the
  whole `takeoff`.
- `node --cpu-prof` on the mutation sweep, self time summed per function:
  `boundedKnapsackMulti` 3.1 s, **the arrow at `engine.mjs:1059` 1.15 s**,
  `lpDualSettle` 1.0 s, `lpAddRow` 0.4 s, `columnGeneration` 0.35 s. That
  arrow was `chunks.map((ch) => new Uint8Array(top + 1))`: a fresh, zeroed
  keep row for every chunk of every call. Instrumented on the sample plan,
  one `takeoff` makes 76 knapsack calls with about 27 chunks each and tables
  up to 1,537 cells, so about 2,000 typed arrays (~3 MB) per takeoff.

## Change

1. **`boundedKnapsackMulti` (`engine.mjs`)**: the keep rows live in one
   module-level `Uint8Array` (`keepScratch`, row `k` at `k * (top + 1)`),
   grown when too small and never cleared. The fill loop now writes every
   cell `c >= w` of a row, 1 if it improved `best[c]` and 0 otherwise, and
   the walk back reads a row only at `c >= w`, so a stale byte from an
   earlier call is never read. The additions, their order and the `1e-12`
   test are unchanged. Nothing re-enters the function while the scratch is
   in use: the common-factor branch returns its recursive call before the
   scratch is touched.
2. **`cli-sweep.test.mjs`**: each plan's 36 CLI runs go through an async
   `spawn` pool, at most `min(4, availableParallelism())` at once. The
   results are checked in flag order afterwards, so the first failing flag
   is still the one reported. A run killed after 60 s is reported as
   `<flag> hung`, as before. The check on the child's stdout and stderr is
   unchanged.

## Verification

- **Knapsack, same answers**: the old and new `engine.mjs` imported side by
  side, `JSON.stringify(boundedKnapsackMulti(...))` compared on 20,000
  seeded random instances (1 to 10 items, weights with common factors 1 to
  3, 15% zero and some negative values, 20% tied values, 1 to 4
  capacities). **0 differences.**
- **End to end, same answers**: the whole mutation sweep's outputs (one
  line per mutation: the refusal, the thrown message or the full `takeoff`
  JSON), 2,420 lines, sha256 `47072532e0aa7a9d…` under both engines.
- **The CLI sweep still catches what it is for.** Two mutations of
  `cli.mjs`, both caught, both reverted: `null.x` on `--gutters` gives
  "--gutters raw error", and a `setInterval` on `--hvac` (with the test's
  limit lowered to 3 s for the trial) gives "--hvac hung".
- **The suite**: 1,202 pass, 0 fail, 1 skipped (the same skip as before).

## Numbers

Same container, bash timestamps around `node --test`.

| | before | after |
|---|---|---|
| `cli-sweep.test.mjs` alone | 12.3 s | 4.0 s, 4.2 s |
| mutation sweep outputs, alone (old and new engine side by side) | 8.93 s | 8.05 s |
| `takeoff(samplePlan())`, mean of 50 warm | 11.6 ms | 9.8 ms |
| suite, `node --test '*.test.mjs'` (two runs each) | 24.8 s, 25.1 s | 22.3 s, 23.6 s |

The suite gains less than the CLI sweep alone, because in the full suite the
mutation sweep (9.4 s, one thread, under contention) is now the longest single
test, and the knapsack change moves it only a little when the cores are
already busy.

## Not changed, ranked for the next run

1. **The mutation sweep is the suite's longest test** (9.4 s in the suite).
   Its 2,420 mutations are independent: splitting them into a few test files,
   or running them on worker threads, would cut its wall time without
   changing a check. Its remaining CPU is the knapsack fill loop (the tight
   `for c` loop itself, about 4 s of self time under the profiler) and the LP
   pivots.
2. LP pivots (`lpDualSettle`, `lpAddRow`): about 1.3 s of the sweep. The next
   step would be a bounded-variable or revised simplex, a bigger change.
3. `fuzz: random networks give a consistent spread` (5.9 s) is the next
   longest test; not profiled.
4. P063 and P064 remain owner-gated (workflow files).
