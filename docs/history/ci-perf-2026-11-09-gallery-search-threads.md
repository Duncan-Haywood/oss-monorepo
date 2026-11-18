# Perf: the Shed Designer gallery search runs its three searches in parallel (2026-11-09)

Perf track. Follows `ci-perf-2026-11-08-gallery-search-stamp.md`, which found the
Pages build job's `Search the Shed Designer gallery` step (about 19 s median,
10.3 job-minutes per 600 runs) and filed a workflow-level cache as P064
(owner-gated). This change needs no workflow edit.

## Reading

`ci_profile.py --runs 200 --steps 25`: the step is 3.2 job-minutes over 11 jobs,
18 s median. `node --cpu-prof make-gallery.mjs`: 24.8 s wall, 35.8 s user, a
flat profile (GC 2.5 s, `dfs` in optimize.mjs 2.0 s, nothing above 8%). So no
single hot loop; but `gallerySearches` ran three independent `searchDesigns`
calls one after another.

## Change

`gallery.mjs` splits out `gallerySearch(key)` and adds `gallerySearchesParallel`,
which runs each search in a worker (`gallery-worker.mjs`). `make-gallery.mjs`
uses it. Each search crosses the thread as one message, so `front` and `kept`
still point at the same objects as `all` (`generateGallery` uses
`kept.includes`).

## Verification

- `gallery-data.mjs` byte-identical (`cmp`) after a cold run, before and after.
- `make-gallery.mjs`, cold stamp, 4-core sandbox: 24.9 s before, 13.8 s after
  (42 s user). `--check` still reports current.
- `gallery.test.mjs`: 5 pass. The "search run now" test uses the parallel path;
  a new test compares worker and in-process results (costs, and object identity).

## Not changed (ranked)

1. P064 (cache the stamp on the input hash) would still remove the other ~14 s
   when nothing changed; owner-gated.
2. The `free` and `house` searches dominate; splitting a search itself across
   threads would be the next lever, with a flat profile behind it.
3. Runner cores: the gain assumes 4 vCPU as on standard runners. Read the after
   number from `ci_profile.py` once merged.
