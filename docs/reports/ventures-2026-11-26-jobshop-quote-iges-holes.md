---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote (bet #2): IGES holes, hole vs boss by ray parity

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#285. Claim slug
`geometry-iges-holes` (ROADMAP item 5, Geometry).

**What landed.** `packages/cad-features/src/iges.ts`: `cylinderOf` (192; 120 revolving a line
parallel to its axis; 128 that samples straight one way and circular the other on a 7 × 7 grid),
`coneOf` (194; 120 revolving a coplanar slanted line), and `igesCylinders`, which groups faces by
axis and radius like STEP's `cylinders()` and fills `cylinders`, `holeAxes` and
`partialCylinderFaces` on each IGES body. Hole vs boss: rays along ±axis from 0.98 r and 1.02 r
count exact crossings of planar faces (point in the face's edge polylines, even-odd over every
segment, so B-rep loops need no outer/inner order) and of full cones on a parallel axis; parallel
cylinders are skipped; any other face whose box the ray enters blocks that ray. The wall must part
air from material, or the cylinder is unclassified (`hole-sense-unknown`). App:
`holeLocationMeasures` accepts `format: "iges"`.

**Traps the next run should know.**

- `ellipsePoints` returned arc samples in Set insertion order (extremes first). That was harmless
  for boxes but made zigzag polygons. It now sorts. Any new code that reads `curvePoints` as a
  polyline relies on that.
- Wrap threshold is 330°, not STEP's 350°: IGES edges are sampled (32 steps per full circle,
  ≥8 per NURBS knot span), so a full wall shows up to an 11.25° gap.
- Three-point circle fits on a closed surface must not use both ends of the domain (same point).
- OCCT writes cylinders as 120 in faces mode (`write.iges.brep.mode` 0, its default) and as 192
  in B-rep mode. `cadquery-ocp` installs from PyPI in a cloud session in about a minute, and
  `packages/cad-features/scripts/make-iges-fixtures.py` regenerates the fixtures.

**Next.** IGES from SolidWorks/NX/Fusion (none permissively licensed found yet), cones written as
128 (they block rays now), cross holes through round parts (needs ray vs trimmed cylinder).

**Verification.** cad-features `node --test`: 73/73. jobshop-quote unit 473/473, worker
`cad-measure` + `rfq-to-quote` 14/14, `tsc` clean, Biome clean. Local
`run_workflow_locally.py jobshop-quote-ci`: see the run record's notes (private runners starved:
`ci_starvation.py` exit 0, "2 of 2 jobs never got a runner").
