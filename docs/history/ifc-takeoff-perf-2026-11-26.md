# ifc-quantity-takeoff: openings cut from the box first, same bytes (2026-11-26)

Perf track, version 0, item 4 ("what visitors wait on"). No perf backlog
item is agent-workable (P063, P064, P086 are owner rows). The IFC takeoff
is the engine behind a for-profit construction product (`transition.py`
row 11), and the page runs it before it shows a result. The last pass
(`ifc-takeoff-perf-2026-11-24.md`) left ISSUE_098_R8 (73 MB, ~31 s) as
item 3 of its "not changed" list: never profiled. This note starts there.

## Reading

Same data and bench as the 2026-11-24 note: the 28 `.ifc` models in
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` (blob-less sparse clone,
not committed); `bench.mjs` (end of that note) times `parseStep` and
`takeoff` and hashes `rowsCsv + boqCsv + JSON.stringify(rows)`. The old
code is a copy of the venture taken before any edit.

`node --cpu-prof` on ISSUE_098_R8, self time summed per function (30.8 s
profiled):

| function | self |
|---|---:|
| garbage collector | 7.2 s |
| `clipPoly` (geom.mjs) | 7.1 s |
| `rayHit` (envelope.mjs) | 2.7 s |
| `assignEnvelope` and its filter closure | 2.3 s |

`clipPoly`'s 8.7 s inclusive were all under `subtractCutters` (openings
cut from walls and slabs). Counted by instrumenting a copy:

- **5,271,728 (body piece, opening) pairs** in 6,836 `subtractCutters`
  calls (up to 1,221 pieces times 567 openings in one element).
- **93% came back empty**; each read every corner of the piece once per
  plane for `scaleOf` and again for the in/out scan: 273 million corner
  reads, 15.4 million planes.
- Of the pairs the piece's box could not settle, 1.57 million were cut by
  one plane and emptied by a later one (5- and 4-face prisms near an
  opening's corner).
- `rayHit` built two `[axis, half-width]` pairs and a normal per call:
  walls x nearby blockers x 9 points x 2 faces x 5 rays.

## Changes

1. `geom.mjs` `clipBounds(faces)`: once per body piece, its box, its
   `scaleOf` (the box's largest |coordinate|, the same number) and its
   distinct corners' coordinates in a `Float64Array`.
2. `geom.mjs` `clipByPlanesBoxed(faces, bounds, planes)`, used by
   `subtractCutters`. Per plane, while every plane before left the faces
   untouched:
   - the box bounds `n.p - k`; a bound past `eps` by more than a rounding
     slack (`1e-12` of the terms' size, far above the few ulps the sums can
     be off) settles the plane: nothing left, or the plane misses;
   - otherwise `lo` and `hi` are taken as `clipPoly` takes them
     (`n0*x + n1*y + n2*z - k`, the same operations in the same order) over
     the distinct corners, which give the same minimum and maximum as every
     corner of every face, and decide as `clipPoly` decides;
   - a plane that really cuts first checks the later planes: if one has
     every corner beyond it (box or corners, with the slack), the answer is
     empty, because every point a cut makes lies between two earlier
     points and so stays beyond that plane, and its scale (hence its `eps`)
     is no larger. Otherwise it hands over to `clipByPlanes` from that
     plane on, with the faces as they are.
3. `geom.mjs` `clipByPlanes`/`clipPoly`: `scaleOf` is worked once and
   passed on while a plane returns the faces untouched (same value).
4. `envelope.mjs` `rayHit`: the two axes as scalars (`u`, then `[-u1, u0]`),
   no arrays per call; same operations in the same order.

## Verification

- **Same answers.** The bench hash is identical before and after on all 28
  models (R8 `0e80c06b7b81`, ARK_NUS `140f2304bfb0`, S_Office
  `9fbc1abff4c3`, Viadotto `48e20d6a0444`, FM_ARC_DigitalHub
  `a89c92f23052`; the same hashes the 2026-11-24 note recorded).
- **New tests** in `fastpaths.test.mjs`: `clipByPlanesBoxed` against the
  verbatim old `clipByPlanes` on 4,000 random prism pairs at four scales
  (1 mm to 300 km, near and far, rotated plane lists, a body against
  itself) and on axis-aligned blocks touching on a face, edge or corner,
  overlapping or apart by 1e-12, 1e-9 and 1e-6; `rayHit` against its old
  copy on 20,000 rays, axis-parallel ones included. Four mutations (a
  wrong sign on the box test, a loose later-plane margin, a loose
  untouched test, the wrong normal in `rayHit`) each fail them.
- `python3 platform/ci/run_venture_tests.py ifc-quantity-takeoff`: 297
  tests, 0 failed, plus the site page checks.

## After

Old and new back to back, two rounds, nothing else running; takeoff
seconds (parse unchanged):

| model | old | new | change |
|---|---:|---:|---:|
| ISSUE_098_R8 (73 MB) | 31.36, 22.76 | 18.89, 17.22 | **−33%** (sum of rounds) |
| S_Office_Integrated Design Archi (31 MB) | 12.62, 12.76 | 8.93, 8.99 | **−29%** |
| ISSUE_129_N1540 (12 MB) | 4.58, 4.38 | 3.35, 3.44 | −24% |
| advanced_model (35 MB) | 11.79, 11.15 | 10.11, 8.73 | −18% |
| FM_ARC_DigitalHub (14 MB) | 12.48, 13.05 | 10.16, 10.78 | −18% |
| ISSUE_068_ARK_NUS_skolebygg (57 MB) | 16.79, 14.02 | 14.38, 13.39 | −10% |

The container's timings wander by 10 to 30% between runs (R8's old code
read 31.4 s and 22.8 s); the new code was faster in every pairing. On R8
the profile's `subtractCutters` went from 9.2 s to 4.7 s inclusive.

## Not changed, ranked for the next run

1. **The garbage collector** is still 6 to 8 s of R8. The cuts that do
   happen (`clipPoly`'s `res`, `cap`, the angle `Map`, `unit`/`cross`
   arrays) and `orientShell`'s loop copies (2026-11-24 item 1) are the
   allocators left.
2. **`assignEnvelope` is quadratic**: per wall it filters every blocker by
   height (`near`), then `isLeaf`, then casts 90 rays against each. A
   height-sorted blocker list, or a plan grid, would read a handful per
   wall. ~2.3 s self on R8 plus `rayHit`'s remaining ~2.5 s.
3. **`unionTerms`' `clipByPlanes`** (0.25 s on R8, 2.8 s self on ARK_NUS
   per the 2026-11-24 note) could take `clipByPlanesBoxed` too; its
   `beyondAPlane` pre-check already covers part of it. Not measured here.
4. 2026-11-24's items 4 and 5 (`idOf`'s coordinate maps, `planRect`'s
   corners) stand.
