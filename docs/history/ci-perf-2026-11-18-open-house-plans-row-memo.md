# Perf, 2026-11-18: open-house-plans, the row memo keyed on the row itself

Perf track, `perf/0`. Follows PR #17165 (`ci-perf-2026-11-18-open-house-plans-gate.md`),
which landed while this run was doing the same gate independently; this run
rebased onto it and kept only what #17165 left.

## Reading

- Before (main at `edc72b74e`): the search sweep from
  `engine.test.mjs`'s first test (every program, studio to five bedrooms,
  every bath count, garage 0/1/2, accessible or not; `searchDesigns(brief,
  { keep: 1 })`), three runs: 8.30, 8.35, 7.79 s.
- `node --cpu-prof` of that sweep, self time summed per function (8.85 s
  sampled): `fitRowMemo` **0.97 s**, the top entry, ahead of `buildWalls`
  0.85, `estimate` 0.73, GC 0.69, `roomPenalty` 0.60. `orderRow` another 0.13.
- Why: the gate calls `fitRowMemo` for about 2 million candidates that reach
  the row step. Each call first runs `orderRow` (two filters and a sort, new
  arrays), then builds a key string with `row.join(",")` and a template, then
  looks it up. The answer was cached; the asking was not.

## Change

`fitOrderedRow(row0, wetAt, L)` in `layout.mjs` replaces `fitRowMemo` and the
order/fit/linen-fallback block in `skeletonGate`. It memoises the whole step
(order, fit, and the linen closet retry) in a `WeakMap` keyed on the row
array `rowSplits` made for this search, then a `Map` keyed on a number
(`L`, or `-1 - L` for `wetAt: "end"`; `L > 0` so the two never collide).
No string, no re-sort on a hit. Results are frozen, so a caller that writes
to one throws instead of corrupting the cache. The `WeakMap` frees each
search's entries when its row arrays go, so no size cap is needed (the old
`Map` had a 50,000-key clear).

## Verification

- Sweep hash of every returned design (JSON): `42e77528ae4c9f62` before and
  after. Evaluated/feasible totals (3,318,816 / 311,789) and every `why`
  failure-reason count: identical (md5 of the printed table
  `d4e7577b…`, both).
- `verify/sensitivity.mjs` output: `cmp` identical.
- `node build-catalogue.mjs --check`: catalogue is current.
- New `layout.test.mjs` pins `fitOrderedRow` against a fresh
  order-and-fit (including the linen fallback) for every row split of four
  programs, both hall ends, L from 3 to 70 ft in half feet; also that a
  second ask returns the same object and that results are frozen. 0.8 s.
- Whole venture: `node --test *.test.mjs`, 43 pass, 0 fail.

## Numbers

| | before | after |
|---|---|---|
| search sweep, 3-4 runs | 8.30, 8.35, 7.79 s | 7.17, 7.56, 7.06, 7.24 s |
| `node --test engine.test.mjs`, interleaved | 15.14, 14.67, 14.40, 15.61, 13.48, 14.69 s | 11.42, 11.72, 12.45, 11.67, 10.70, 11.48 s |
| median | **14.7 s** | **11.5 s** |

Wall-clock on this 4-core container, `date` around each run, before and
after alternated with `git stash` so load drift hits both. The engine test
gains more than the `keep: 1` sweep because its other tests run `design()`
with `keep: 6` and the variants, which repeat the same rows.

## Not changed, ranked for the next run

1. **Scoring the ~311k feasible stage-A candidates** (`buildWalls` via
   `planDrivers`, `estimate`, `roomPenalty`/`netBox`) is now most of the
   search. Stage A only keeps 40; a cheap lower bound on `score` from the
   parameters could skip most, but it needs an equivalence test.
2. `cleanSimple` on every `rect()` room (#17165's item 2 still stands).
3. `framing.test.mjs` (3.5 s) and `catalogue.test.mjs` (2.5 s): no profile yet.
4. P063 and P064 remain owner-gated (workflow files).
