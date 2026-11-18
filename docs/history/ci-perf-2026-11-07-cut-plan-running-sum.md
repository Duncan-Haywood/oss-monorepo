# Shed Designer gallery search: running sum in the cut planner (2026-11-07)

Perf track. Metric: wall time of `node ventures/shed-designer/make-gallery.mjs`
(the "Search the Shed Designer gallery" step of Portfolio Pages, ~18 s a run).

## Reading

`ci_profile.py --runs 300` step table: that step was 3.6 job-minutes over 12
jobs. `node --cpu-prof` with `.gallery-stamp` removed (otherwise the stamp skips
the search): 22.2 s, 16.4 s inside `evaluateDesign`, 9.2 s in `estimate`, 7.5 s
in `optimizeCuts`; `plan` (best-fit-decreasing) had 1.4 s self time.

## Change

`plan` in `optimize.mjs` called `usedLength([...b.cuts, p], kerf)` for every
bin and piece: a copy and re-sum of the bin each time. Bins now carry a running
`sum`; `cap - (sum + p.len + kerf * cuts.length)` adds the same floats in the
same order, so the result is the same number.

## Verification

- Before/after, 2 runs each, stamp removed: 22.1/22.6 s vs 19.0/19.4 s.
- `gallery-data.mjs` byte-identical (`cmp`) to the committed one.
- `node --test optimize/estimate/gallery/designsearch tests`: 46 pass.

## Not changed (ranked)

1. `estimate` re-runs `cutWithinHaul` for lists identical across search steps
   (`cachedLP` only memoises the LP); memoising the whole cut result by key
   would cut most of the 7.5 s.
2. GC is 3.1 s of the 22 s: `buildShed` allocates a full model per candidate.
3. `gambrelAnalysis`/`solveFrame` 2.7 s, recomputed per candidate.
