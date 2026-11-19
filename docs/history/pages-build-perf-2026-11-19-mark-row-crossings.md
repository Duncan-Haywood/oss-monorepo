# Pages build perf, 2026-11-19: the logo's point-in-polygon test, once per row

Perf track, run 2026-11-19 (session in the run record).

## How the target was picked

- Both perf backlog rows (P063, P064) are still owner-gated workflow edits.
- `ci_profile.py --runs 200 --top 15` (2026-11-19 00:40 to 01:00 UTC): the
  largest single step in the pool is Portfolio Pages' "Test the site builder",
  20.1 job-minutes over 33 jobs.
- `suite_file_times.py platform/pages --jobs 2`: `build.test.mjs` 316.5 s
  cold, `custom-domain.test.mjs` 51.9 s, then a long tail under 11 s.
- A `--cpu-prof` of `custom-domain.test.mjs` (32.8 s, no `PAGES_CARD_CACHE`):
  `markSample` (sharecard.mjs) was the largest piece of JavaScript self time at
  **1,333 ms**. That test builds with `cards: false`, so all of it comes from the
  mark drawn for the four app icons, the three favicon sizes and the site
  card: 7,459,368 `markSample` calls (counted). Each tested both star
  polygons (16 edges each) from scratch.

Tried first and reverted: two exact changes to `clothing-design-studio`'s
`pushOut` (an allocation-free `sectionAt`, and a widest-half-axis reject). The
drape bench stayed at 5.8 to 6.1 s with the same sha256. V8 had already removed
the allocations, and a hanging tee sits too close to the body for the bound to
reject much (85% of 8.0 M `pushOut` calls end outside, but past the bound only
rarely).

## Change

`markSample`'s polygon test depends on v only through each edge's crossing x,
`((xj - xi) * (v - yi)) / (yj - yi) + xi`, for the edges with
`(yi > v) !== (yj > v)`. Every sample in a pixel row shares one of four v
values. `markCoverage` and `drawMarkDirect` now keep a Map from v to both stars'
crossing lists (`rowCrossings`). A sample is inside when an odd number of the
crossings are greater than u. That is the same expression and the same
comparison, so the pixels are the same. `inPolygon` moved out of
`sharecard.mjs` into the new test as the reference.

## Verification

- **New test `platform/pages/mark-raster.test.mjs`.** It keeps the old
  `drawMarkDirect` with the per-sample walk, and requires `drawMark` to give the
  same bytes for 11 placements (whole offsets, which use the cached coverage,
  and fractional ones, which draw directly), for RGB and RGBA, with and without
  the plate: 44 canvases. It passes on the old and the new `sharecard.mjs`. It
  fails when the crossing comparison is nudged (`u <= x + 1e-4`).
- **Full site, cold card cache.** `env -u PAGES_CARD_CACHE node build.mjs
  --out=<dir>`, old and new. `diff -rq` finds only `version.json`'s
  `built_at`. All 34,162 files match, including 9,275 PNGs.
- **Bench, fresh process each.** Nine icon variants, the site card and three
  fractional draws hashed: sha256 `d46e2e67abe41a6f…` both ways.

## Numbers

Same container (4 cores, Node 22.23.5), `performance.now()` inside a fresh
process. Old is `git show HEAD:platform/pages/sharecard.mjs` imported side by
side.

| | before | after |
|---|---|---|
| what a cold build draws (4 app icons, 3 favicon sizes, site card) | 1.98 / 2.14 / 2.10 s | 1.14 / 1.24 / 1.33 s |
| wider bench (9 icons incl. a 1024 px maskable, site card, 3 direct draws) | 3.38 / 4.30 / 4.02 s | 1.85 / 1.78 / 1.68 s |
| `markSample` self time in that bench | (most of it) | 588 ms |
| cold full build `node build.mjs`, wall | 140.6 s | 141.7 s (noise: cards draw in worker processes, and the mark is a small part of a card) |
| `custom-domain.test.mjs` alone | 30.5 / 31.1 s | 29.3 / 33.1 s (noise of ±2 s hides the ~0.8 s) |

So this saves about 0.85 s of CPU in each process that draws the icons without
a warm card cache. That covers local agent builds, every test process that
builds the site cold, and `offline.mjs`'s store icons. The CI build job with a
warm cache gets the icons from disk (2026-11-15) and gains only the favicon
and site card share, about 0.1 s. It is a small, exact win. Report it as that.

## Not changed, ranked for the next run

1. **`build.test.mjs` cold, 316 s alone.** That is ten times its CI step share.
   The cold card cache is the suspect (`PAGES_CARD_CACHE` unset locally). A
   reading with the cache set the way the workflow sets it would show whether
   the local number misleads sessions that run it.
2. **`custom-domain.test.mjs` idle time, 7.6 s of 32.8 s.** It waits on
   `spawnSync` children and `writeFileUtf8` (3.3 s self) for a 350 MB fixture
   build. It needs the whole site's markup, so it cannot be trimmed without
   changing what it proves.
3. **`markSample` (0.59 s), `drawMarkDirect` (0.38 s) and `field` (0.24 s)** are
   what is left in the bench. An 8-fold symmetry shortcut is not exact,
   because the star's vertices are rounded to 4 decimals.
4. **clothing-design-studio `simulate`'s XPBD edge loop**, still 3.0 s of
   6.0 s for three tees. Its arithmetic order is the output.
5. P063 and P064 remain owner-gated.
