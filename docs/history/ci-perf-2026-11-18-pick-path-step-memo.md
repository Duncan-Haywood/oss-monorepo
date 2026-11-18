# pick-path-optimizer: memoised DP transitions and a length-only router (2026-11-18)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch CI paths
in `.github/CODEOWNERS`, so this run took step 3 of the prompt: a venture
suite nobody had profiled. `suite_file_times.py` showed ai-bookkeeper flat
(no file over 3.4 s, start-up dominated); pick-path-optimizer had no earlier
perf write-up and spent 5.7 of its 6.3 s in one file, `calc.test.mjs`.

## Reading

`node --cpu-prof calc.test.mjs`, self time per function (ms):

| function | before | after |
|---|---:|---:|
| `optimalRoute` / DP loop (route.mjs) | 1759 | ~1245 |
| `applyHorizontal` | 841 | ~0 (memoised) |
| `normalise` | 183 | ~0 (memoised) |
| `visitOrder` + `eulerWalk` + `id` | 577 | gone from the batch search |
| GC | 398 | 244 |

(The "after" column is the profile after the transition memo, before the
length-only router.)

The Ratliff-Rosenthal DP keeps a handful of frontier states per column. For
every state x in-aisle option x cross-aisle copies (f, g) it allocated a
vertical state, a horizontal state, a relabelling `Map`, a normalised state
and a string key, and it rebuilt the 9-element `hs` array per state and
option. The result depends only on the state, the option's `addA`, `addB`,
`join`, whether its cost is zero, and `f`, `g`: 396 distinct combinations over
the whole `bench.mjs` run (16,000 random pick lists).

Second cost: `makeRouter().length`, called thousands of times by the batch
search, threw the walk away, but `optimalRoute` still built it (Hierholzer
plus `visitOrder`).

## Change

- `route.mjs`: states keyed by a small integer code instead of a template
  string; `step()` memoises `normalise(applyHorizontal(applyVertical(...)))`
  in a module-level `Map` and shares the read-only result; the `hs` tables are
  hoisted; the closed-state skip moved out of the option loop (same test).
  The DP is factored into `bestTour`, and a new export `optimalLength` returns
  only `best.cost`. The unused `trail` array is gone.
- `calc.mjs`: the router's cached `length` calls `optimalLength`.
- `route.test.mjs`: a new test pins `optimalLength === optimalRoute().length`
  on 1,200 random cases with and without a back aisle.

Map insertion order and the `cost < prev.cost - 1e-9` tie-break are
unchanged, so the DP keeps the same entry for every state in every column.

## Verification

- A golden script (2,520 `optimalRoute` results over three depots, with and
  without a back aisle, 1 to 40 picks, plus `comparePolicies` and
  `optimiseBatches` on the example under three settings): 1,786,636 bytes of
  JSON, `cmp` identical before and after.
- `node bench.mjs` output `cmp` identical.
- All four test files pass (7 + 6 + 6 + 6 tests).
- `run_workflow_locally.py --for-changes`: 8/8 selected workflows' run steps
  passed (uses: steps not run).

## Numbers (4-core container, idle, wall)

| | before | after |
|---|---:|---:|
| `node --test calc.test.mjs` (3 runs) | 6.22, 6.25, 6.48 s | 2.03, 1.92, 1.74 s |
| suite, `suite_file_times.py pick-path-optimizer` | 6.3 s | 2.1 s |
| `node bench.mjs` | 6.7 s | 4.0 s (after the step memo alone) |

## Not changed, ranked for the next run

1. `optimalRoute` self time (~1.2 s): one `{s, cost, back}` object per
   improving relaxation and `Map` traffic. Parallel typed arrays indexed by
   the state code (at most 139 codes) would remove both; worth it only if the
   page's own compute time becomes a complaint.
2. `makeRouter().length` (~0.3 s self): `[...new Set(keys)].sort().join(",")`
   per call to build the cache key. Batches could carry their sorted key set.
3. tile-layout-optimizer `calc.test.mjs` (5.4 s of 7.5 s) and
   demand-charge-interval-analyzer `tou.test.mjs` (2.8 s of 4.7 s) are the
   next concentrated, never-profiled files seen in this reading.
