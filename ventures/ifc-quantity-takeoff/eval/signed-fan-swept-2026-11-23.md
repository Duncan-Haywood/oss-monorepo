# The swept check on a signed fan, 2026-11-23

Follows [half-round-ends-2026-11-23.md](half-round-ends-2026-11-23.md). A
curved wall's side is measured on its own facets (`curvedFaces`, geom.mjs)
only when the faces it reads add up to the body's volume, by one of two
checks in `computeAreas` (qto.mjs):

- **one section:** mean face x width = volume within 2% (a wall of one
  section all the way up);
- **swept:** the two faces enclose the volume by the divergence theorem in
  plan within 2% (any section up the height, as long as every other face is
  level or lies along a radius: a stepped wall, a recess, a duct along the
  foot; [triangulated-arc-breps-2026-11-23.md](triangulated-arc-breps-2026-11-23.md)).

The swept check was kept off any body with a negative term. That guard came
in while ISSUE_129's two half-ring walls were misread as "cutter faces". The
half-round note traced those to two ends sharing one plane through the
centre, not to negative terms, but left the guard on because a drawn
profile's signed fan had never been run through the swept check. This run
did that.

## Why a fan could matter

A drawn outline (`IfcArbitraryClosedProfileDef`) that is not convex is split
by `convexPieces` into triangles fanned from its first vertex, each signed by
its orientation. On a ring, about a third of them are negative and span the
hollow. Their side faces are the fan's diagonals, which have to cancel plane
by plane, while the arc chords must keep their outward sense whatever the
triangle's sign. If either went wrong, the outer and inner faces would be
wrong and so would `swept`.

## 1. Constructed walls (engine.test.mjs)

Each wall is a quarter ring (30 chords) or a half ring (180 chords): a base
0 to 0.75 m between the inner radius and the outer, and the wall above, 0.75
to 3.97 m, between a middle radius and the outer. Both items are drawn
outlines, so the engine sees a signed fan for each. Expected faces are the
chords times the heights, worked out by hand.

| Wall | Negative terms | swept / V - 1 | one section / V - 1 | outer, inner | Check that passes |
|---|---:|---:|---:|---|---|
| quarter, r 2.3 / 2.2 / 1.877, fan from the outer arc | 42 of 120 | -2.0e-15 | -0.0246 | = chords, to 1e-9 | swept |
| the same, fan from the inner arc (start vertex 40) | 56 | -7.8e-16 | -0.0246 | = chords | swept |
| half ring, r 20.2 / 19.6 / 18.4 | 322 | -4.2e-14 | -0.0071 | = chords | one section and swept |
| the same, fan from vertex 200 | 356 | 5.1e-15 | -0.0071 | = chords | one section and swept |
| quarter with a radial recess cut by a boolean difference (facets 10 to 20, 0.2 to 0.6 m, back face at r 2.0) | 105 | -7.1e-15 | -0.0225 | inner = chords - recess mouth + back face, to 1e-9 | swept |
| quarter with both ends cut square (x = 0.6, y = 0.6), not along a radius | 134 | +0.285 | -0.0403 | - | neither (refused, rightly) |

The quarter rings miss the one-section check by 2.5%, so with the guard they
were refused and kept the chord cut; the swept check matches to 1e-14.
Ends cut square are neither level nor radial, so the faces do not enclose
the volume; the check refuses them by 28%, with or without negative terms.

The same quarter as a file (two `IfcExtrudedAreaSolid` items of
`IfcPolyline` rings on one `IfcWall`) goes through `takeoff`: with the guard,
`side.stepped` is unset and the side area is the 2.49 m2 chord cut; without
it, the side is the mean of the faces (13.84 m2), outer 14.341 and inner
13.337 m2 as by hand. That test fails with the guard put back.

## 2. The change

`computeAreas` (qto.mjs) no longer refuses the swept check for a body with
negative terms or shells.

## 3. The public models

**Data.** The 28 `.ifc` files in `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (blob-less sparse clone, not committed; the two
`.ifczip` files skipped). Rerun: `node eval/curved-walls.mjs <files>` before
and after the change, and diff.

Four models have walls the engine reads as built on an arc: 134 walls. The
output before and after is identical, line for line: no public wall was
being held back by the guard. Instrumented (a debugging line in a scratch
copy, not committed), the 134 split as:

| Model | Curved walls | Measured, no negative terms | Measured, negative terms | Refused: facets face no one centre |
|---|---:|---:|---:|---:|
| ISSUE_129 (tunnel) | 84 | 8 | 21 | 55 (all with negative terms) |
| ISSUE_098 (R8) | 36 | 0 | 24 | 12 (4 with negative terms) |
| ARK_NUS skolebygg | 12 | 12 | 0 | 0 |
| dental_clinic | 2 | 2 | 0 | 0 |

So 45 real walls with negative terms already passed the one-section check
(their faces read right off signed fans), and every refused wall fails
earlier, in `curvedFaces`, before either check: its standing facets do not
face one centre (straight walls with rounded ends, `bendsInPlan` too broad;
NEXT.md). None reached the swept check and failed it.

## What this does and does not show

It shows the swept check holds on signed fans and on a boolean recess built
the way the engine builds them, to rounding, and still refuses a body whose
other faces are not level or radial. It does not show it on a real stepped
arc wall drawn as outlines: none of the public models has one. The README's
claim is limited to that.

Left (NEXT.md): a public model with such a wall; stepped arc walls with ends
cut square, which both checks refuse.
