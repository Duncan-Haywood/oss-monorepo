# ifc-quantity-takeoff: the bridge takeoff a third faster, same bytes (2026-11-24)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch workflow files in `.github/CODEOWNERS` and
wait for the owner. The page runs the takeoff before it shows a result, and
the last takeoff pass (`ci-perf-2026-11-21-ifc-takeoff-clip-and-orient.md`)
predates the IFC 4.3 lofts, the coating column and the face-by-face areas,
all added since. Viadotto Acerno took 12 s when it first read on 2026-11-22
(`eval/linear-placement-2026-11-22.md`); it took 17.6 s today.

## Reading

The 28 `.ifc` models in `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`
(blob-less sparse clone, not committed). A bench script (end of this note)
times `parseStep` and `takeoff` separately and hashes
`rowsCsv + boqCsv + JSON.stringify(rows)` so before and after can be
compared byte for byte. Old code is `git stash`ed `*.mjs` copied aside.

`node --cpu-prof` on Viadotto Acerno, self time summed per function:

| function | self |
|---|---:|
| garbage collector | 9.7 s |
| `planeAreas` (geom.mjs) | 3.8 s |
| `planRect` (envelope.mjs) | 3.3 s |
| `orientShell` + its `idOf` | 2.3 s |

Counted by instrumenting a copy:

- **`planRect`** read 9.2 million corners for 805 walls, members and
  railings, 2.0 million of them distinct point arrays (faces share their
  corners), and scans every corner for each of its 113 trial directions.
- **`planeAreas`** ran 1,464 times on Viadotto, 720 of them a second time
  on the same body: `computeAreas` sums a steel beam's, column's or
  member's faces once for the coating column and again for the
  cross-section check. Over the 744 distinct calls it reads 2.9 million
  loops into 2.1 million planes (one lofted deck alone has 900,658 loops),
  building a `"${a},${b},${c},${d}"` string key per loop. Line ticks put
  the cost in the `Map` lookups, then in the arrays made per loop.
- **`orientShell`** keyed its edges in a `Map` by `lo * 2^26 + hi`. Keys
  above 2^31 are heap numbers, and `edges.get`/`edges.set` were the two
  hottest lines of the function on FM_ARC_DigitalHub.

## Changes

1. `envelope.mjs` `planRect`: each corner array is read once (a `Set` of
   the arrays). A corner seen again cannot move a minimum or maximum, so
   the rectangle is the same.
2. `qto.mjs` `computeAreas`: the body's `surfaceArea` is summed once and
   reused by the coating and cross-section checks.
3. `geom.mjs` `newell`: sums three scalars, not two new arrays per edge.
   Same additions in the same order.
4. `geom.mjs` `planeAreas`: the loop's area vector, unit normal and offset
   are worked in scalars with the same operations in the same order as
   `newell`/`mulS`/`unit`/`dot`. Planes go in an open-addressed table of
   plane numbers, with the four rounded keys compared as SameValueZero (the
   string keys' semantics: -0 and 0 one key, NaN one key). Planes come out
   in the order first met, as the `Map` gave them.
5. `geom.mjs` `orientShell`: edges in an open-addressed table on their two
   point ids, numbered in the order first met as before; adjacency as
   `neighbour * 2 + mustFlip` numbers in place of a pair per edge.

## Verification

- **Same answers.** The bench hash is identical before and after on all 28
  models (the table in the run's notes; Viadotto `48e20d6a0444`,
  FM_ARC_DigitalHub `a89c92f23052`, ARK_NUS `140f2304bfb0`, R8
  `0e80c06b7b81`).
- **New tests** in `fastpaths.test.mjs`: `planeAreas` against a verbatim
  copy of the string-keyed version (400 random bodies at three scales,
  signed and unsigned, a 7,200-triangle grid with a plane per triangle so
  the table grows, a grid on one plane, -0 corners, degenerate and short
  loops, an infinite coordinate); `planRect` against its old copy (300
  bodies, two matrices, two units); `orientShell` against its old copy on
  20 grids of up to 1,500 triangles, some opened. Breaking either table's
  key comparison fails them (checked).
- `python3 platform/ci/run_venture_tests.py ifc-quantity-takeoff`: 289
  tests, 0 failed, plus the site page checks.

## After

Old and new run back to back, two rounds, nothing else running; takeoff
seconds (parse is unchanged, 0.1 to 0.9 s):

| model | old | new | change |
|---|---:|---:|---:|
| Viadotto Acerno (33 MB, IFC 4.3 bridge) | 17.58, 17.58 | 11.33, 11.60 | **−35%** |
| FM_ARC_DigitalHub (14 MB) | 14.46, 14.26 | 12.80, 12.61 | −12% |
| ISSUE_159_kleine_Wohnung_R22 | 5.78, 5.90 | 5.35, 5.31 | −9% |
| ISSUE_068_ARK_NUS_skolebygg (57 MB) | 16.30, 16.00 | 16.04, 15.93 | ~0 |
| S_Office_Integrated Design Archi | 13.21, 13.74 | 13.30, 13.73 | ~0 |
| advanced_model | 12.70, 13.37 | 12.76, 13.14 | ~0 |
| ISSUE_098_R8 (73 MB) | 31.76, 33.68 | 30.62, 33.11 | ~−2% |

A first before-run of all 28 models had the venture suites running beside
it and read 20 to 50% higher than the clean old runs; those numbers are not
used here. The win is where the profile said: bodies with very many faces
(the lofted bridge, the curved MEP breps). The building models' time is
elsewhere (below).

## Not changed, ranked for the next run

1. **The garbage collector is still the largest line everywhere** (5 s of
   11 s on Viadotto, 6 s of 16 s on ARK_NUS). `orientShell` still copies
   every loop (`faces0.map(f => f.map(l => l.slice()))`) before turning
   any; callers would need checking before it could share untouched loops.
2. **`clipPoly` is 2.8 s self on ARK_NUS** (unionTerms' 30k pairs that
   share volume), the 2026-11-21 note's item 2: an exact "B inside A" test.
3. **ISSUE_098_R8 (31 s) has not been profiled** on this code. Start there.
4. **`idOf`'s nested Maps on x, y, z** are ~0.9 s on Viadotto: most
   lookups hit `seen` (the same point array), so the coordinate maps are
   the cold path.
5. **`planRect` still scans 2.0 million distinct corners 113 times** on
   Viadotto (~1 s). A convex hull first would cut that to a few hundred
   points per body, but rounding can put a hull-interior point a hair
   outside in some direction, so it needs a tolerance argument and a test;
   not done.

## Bench script

`node bench.mjs <venture dir> <model.ifc> ...`

```js
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
const dir = process.argv[2];
const { parseStep } = await import(dir + "/step.mjs");
const q = await import(dir + "/qto.mjs");
for (const f of process.argv.slice(3)) {
  const buf = readFileSync(f);
  let t0 = performance.now();
  const m = parseStep(buf);
  const tp = performance.now() - t0;
  t0 = performance.now();
  const res = q.takeoff(m);
  const tt = performance.now() - t0;
  const h = createHash("sha256").update(q.rowsCsv(res.rows) + q.boqCsv(q.boq(res.rows), ["class", "type"])
    + JSON.stringify(res.rows, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v))).digest("hex").slice(0, 12);
  console.log(`${basename(f)}\tparse ${(tp / 1000).toFixed(2)}s\ttakeoff ${(tt / 1000).toFixed(2)}s\trows ${res.rows.length}\t${h}`);
}
```
