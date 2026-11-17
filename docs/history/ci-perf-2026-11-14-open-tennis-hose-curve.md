# CI perf, 2026-11-14: open-tennis-robots hose-curve search, bit-identical and 3 to 8 times faster

Perf track. Both open perf backlog items (P063, P064) touch workflow files, so
they wait for the owner. This run took the third-largest consumer in a fresh
pool reading that is not a workflow edit: the open-tennis-robots `cad` job.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --top 15` (2026-11-14 14:25Z to
15:05Z, 299 jobs, 307.9 job-minutes): open-tennis-robots CI 21.6 min over 6
jobs, its heaviest step "CAD checks and committed-package freshness" 12.5 min.
P066 (done, 2026-11-13) had already cut that job from 19 min to about 7 by
caching `all_parts` and running the two package builds as subprocesses.

Local, this container (4 cores, Python 3.11, build123d 0.13.0 in a venv):

| | before | after |
|---|---|---|
| `python -m unittest discover -s tests` in `cad/` (101 tests, OK) | **264 s** | **195 s** |
| `python -m otr_cad feeder --out ...` (one package build) | 107 s | 90 s |
| the 400 distinct planar `_hose_curve_range` calls the build and checks make | 45.7 s | 6.0 s (7.6x) |
| the 750 distinct `_hose_curve_range_3d` calls | 28.3 s | 9.3 s (3.0x) |

Each timing is one wall-clock run on an otherwise idle container; before and
after ran back to back.

## Profile

`python -m cProfile` on one feeder build (141 s under the profiler):
`Feeder.check` 36.5 s, nearly all of it `sleeve_take_up_design` (292 calls,
35.3 s) through `_ranges_from`. The two range searches are already
`lru_cache`d, so the cost was the ~220 distinct calls themselves:
`_bezier_stats` 115,344 calls, 12.6 s self, 28.7 s cumulative, and
`_hose_curve_range_3d` 7.5 s self. Each planar call scores a 36 x 36 grid of
Bezier handle lengths and computed the length, peak curvature and flattest
slope of every candidate over 25 points before testing any of them; most
candidates fail.

The rest of the build is OCC: `_drawings` (SVG projection) 25.5 s, `clashes`
(boolean intersections) 22.8 s, `Shape.__deepcopy__` via `moved()` 11 s,
`bounding_box` 11 s.

## Change (`cad/otr_cad/params.py`)

- `_hose_curve_range`: test bend and fall point by point and reject a curve
  at its first failing point; hoist the t-only coefficients and the tilt's
  sin/cos; measure the length (`_bezier_length`, split out of
  `_bezier_stats` unchanged) only for curves that fit.
- `_hose_curve_range_3d` already exited early; its per-t coefficients are now
  hoisted and its 3-vector list comprehensions unrolled.

Every float is formed by the same operations in the same order as before
(`3 * w * w * d` is `(3 * w * w) * d`; sums keep their left-to-right order;
`** 2` and `** 3` stay as they were), so the results are the same bits, not
merely close. The early exit gives the same verdict as the old
`kmax <= 1 / r_min and smin >= slope_min` because `max`/`min` in the old
code ignore NaN the same way `>`/`<` do in the new.

## Verification

- All 1,150 argument sets recorded from a feeder `check()`, both take-up
  designs, `hose_pose_ranges` and four off-default designs (bend radius 60
  and 400 mm, fall limit 5 and 40 deg; 80 planar and 180 3-D results are
  None): old and new results compared by `float.hex()`, 0 mismatches.
- Feeder package built before and after: `diff -r` of the two output folders
  and of the unzipped archives is empty (the zip files themselves differ only
  in the output folder's name, which is in every entry path).
- Full `cad/tests` suite with build123d: 101 tests OK, including both
  committed-package freshness checks. Without build123d: 101 run, 49 skipped,
  OK (19.8 s).
- New test `HoseCurveSearchTest.test_fast_searches_match_the_reference`
  keeps a plain copy of the old code in the test file and asserts equality on
  three poses at azimuth 0 and at `az_max`, fitting and non-fitting (3.2 s,
  runs without build123d too).

## Not changed, ranked for the next run

1. **`_drawings` (25 s of a 90 s build)**: three `project_to_viewport`
   calls for the SVG views. It runs once per build and in both the module's
   subprocess builds; a test-only `drawings=False` would skip what the
   committed-package check compares, so it stays.
2. **`clashes` (23 s)**: OCC boolean `&` on every overlapping-box pair at
   every sweep pose. A cheaper prefilter than the axis-aligned box (oriented
   boxes, or `BRepExtrema` distance with a 0 tolerance) might skip pairs, but
   must give the same clash list; measure the box-overlap pass rate first.
3. **`moved()` deep copies (11 s)**: `Part.placed()` deep-copies each
   shape per placement. `located()`-style sharing could be exact but changes
   object identity inside build123d; check exporters do not depend on it.
4. **`_hose_curve_range_3d` (9.3 s for 750 calls)** is now the larger hose
   search. Its remaining cost is `math.hypot`/`sqrt` per point; a vectorised
   numpy form would not be bit-identical.
5. P063 and P064 remain owner-gated (workflow files).
