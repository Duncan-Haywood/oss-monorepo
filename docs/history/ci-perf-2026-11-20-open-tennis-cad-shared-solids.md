# CI perf, 2026-11-20: open-tennis-robots CAD sweeps share placed solids, boxes and the lift's own pairs

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner. This run took the largest non-workflow
consumer the pool reading showed outside the Pages builder and the shared
venture tests.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-20, about
13:15 UTC; 564 jobs, 747.5 job-minutes over two hours): open-tennis-robots CI
used 50.3 job-minutes in 12 jobs, and its heaviest step, "CAD checks and
committed-package freshness" (`python -m unittest discover -s tests` in
`ventures/open-tennis-robots/cad`), used 19.4 of them.

## Profile

This 4-core sandbox, build123d 0.13.0 in a venv, wall time with `time`:

- `python -m otr_cad feeder --out <dir>` (the build the suite starts as a
  subprocess): 116.1 / 115.6 s on `main`.
- Under `cProfile` (138 s): booleans 45 s (needed); `Shape.moved` 17 s, of
  which 12.6 s is `Part.placed()` deep-copying every solid again at each of
  73 `swept_solids` poses; `bounding_box` 14.8 s over 49,760 calls (11.7 s in
  `BRepBndLib.AddOptimal`), ~12 s of it the sweeps re-boxing the same fixed
  parts at every pose; `Feeder.check` 12.6 s (the hose-curve search inside
  `sleeve_take_up_design`, 292 calls).
- The suite: 281 s wall, 147 tests, with a per-test timer (a `TextTestResult`
  subclass). The feeder build runs beside the tests, so it is not the long
  pole. The top test, `LiftCadTest.test_lift_stands_outside_the_head_and_turntable_at_every_pose`,
  took 51 s: 2,226 intersections, 1,476 of them the lift's own 82
  box-overlapping pairs, intersected twice at each of 9 poses although the
  lift never moves. `DeckCableCadTest.test_runs_clear_every_part_and_the_head_at_the_actuator_limits`
  (18.7 s) did the same with the deck cables, three times per pose, and the
  head's own pairs twice.

## Change

1. `otr_cad/feeder.py`: `_placed_named(p)` builds each placed solid once per
   cached parts list (it lives in the `_ALL_PARTS_CACHE` entry), and
   `swept_solids` reads it. `bbox(s)` remembers the exact box of those shared
   solids (keyed by id, with the solid kept beside it; evicted with the cache
   entry). Callers only read, intersect or `rotate()` (a copy) the shared
   solids; the assembly STEP still uses fresh `part.placed()` copies, since
   `Compound(children=...)` sets each child's parent.
2. `otr_cad/package.py`: the sweeps take boxes from `F.bbox`; new
   `cross_clashes(first, second)` gives the entries `clashes(first + second)`
   makes for pairs across the two lists (same predicate and text).
3. `tests/test_cad.py`: the lift and deck-cable pose tests intersect the
   parts that stay put once. `clashes(moving + lift)` holds the entries of
   `clashes(moving)`, `cross_clashes(moving, lift)` and `clashes(lift)`
   (interleaved: `combinations` walks pairs by first element), so
   `clashes(moving + lift) == clashes(lift)` exactly when the first two are
   empty, and that is what the test now asserts. The deck-cable test keeps its
   final `clashes(mine) == []`. New `CrossClashesTest` pins the split on boxes
   with clashes inside and across the lists, in order.

## Verification

- `diff -r` of the feeder package folder built by `main`'s code and by this
  branch: identical (manifest with collisions, rules and file hashes; every
  STEP, DXF, STL and SVG). The zips differ only in the folder name inside.
- Full suite: 148 tests OK, including both committed-package freshness checks.
- On the real machine at elevation +45, azimuth -36.4 deg (the one pose where
  head and lift boxes overlap): `sorted(clashes(moving + lift)) ==
  sorted(clashes(moving) + cross_clashes(moving, lift) + clashes(lift))`, and a
  solid seeded into the head's place is caught by `cross_clashes`.

## After (same box, same session)

| measure | main | this branch |
|---|---|---|
| feeder build, wall | 116.1 / 115.6 s | 98.5 / 97.8 s |
| CAD suite, wall | 289 s (`time`, one run) and 281 s (timed runner) | 229 s (timed runner) |
| CAD suite, CPU (user) | 9 min 28 s | 7 min 9 s |
| lift pose test | 51.3 s | 14.4 s |
| deck-cable pose test | 18.7 s | 9.2 s |

One-off runs on a shared 4-core box, not medians. `main`'s 289 s suite ran from a scratch copy of `cad/`
without `manufacturing/`, so its freshness tests errored there (6 failures and errors, same 147 tests). The CI cad job runs the same
suite plus a ~1 min pip install, so expect roughly 50 s off each run.

## Not changed, ranked for the next run

1. **`FeederGeometryTest.test_elevation_sweep_can_fail` (23.6 s) and
   `test_elevation_actuator_sweep_can_fail` (19.5 s)** now top the list; both
   call `clashes(swept_solids(...))` over the whole machine for a known-bad
   design. Most pairs are the parts below the head, which do not move with
   elevation: the same `clashes(moving) + cross_clashes(moving, still)` split
   would apply, but these tests build a modified `Feeder`, so the still parts'
   own pairs must be computed for that design (once per test, not per pose).
2. **`Feeder.check` 12.6 s per build** (twice per suite: the build and the
   params tests): `check_azimuth` calls `azimuth_drive` twice (7.1 s) and
   `check_cables` -> `check_elev_lead` (2.6 s); both end in
   `sleeve_take_up_design` -> `_ranges_from` -> `_hose_curve_range_3d`
   (3,796 calls). Memoising `sleeve_take_up_design` on its inputs is the
   likely win; it is pure but takes a `Feeder` (unhashable), so key it on the
   fields it reads.
3. **`rotate()` deep-copies** (3,400 calls, 4.2 s per build), including the
   no-op rotations at elevation 0 and azimuth 0.
4. **`_drawings`** (24 s per build, SVG projection and DXF export): only the
   committed-package check reads them; not worth a separate path yet.
