# Ends cut square in the swept check, 2026-11-23

Follows [signed-fan-swept-2026-11-23.md](signed-fan-swept-2026-11-23.md),
which left this open: a curved wall whose section steps up its height, and
whose ends are cut square to the plan axes instead of along a radius, was
refused by both volume checks in `computeAreas` (qto.mjs) and kept the chord
cut. The two faces it reads were right; the check could not prove it.

## Why the ends broke the check

The swept check is the divergence theorem in plan. Take the field
F = (p - C) / 2 across `up`, with C the bend's centre. Its divergence is 1, so
the volume is the sum over every face of area x (p - C) . n / 2, with n the
face's normal in plan. A level face adds nothing, because its normal has no
plan part. A face along a radius adds nothing, because (p - C) is
perpendicular to n there. So with level or radial ends, the outer and inner
faces alone give the volume, and that is what the check compares.

An end cut square, at x = 0.6 on a quarter ring centred on the origin, has
(p - C) . n = -0.6 at every point on it. Its flux is its area x -0.3, and
leaving it out puts the check 28% off on the test wall.

## The change

`curvedFaces` (geom.mjs) now returns `ends`: the same flux summed over the
standing planes that face no centre (more than 25 degrees off the radius,
the planes it already set aside as ends or reveals), plus their area as
`endArea`. A plane's flux is exact, because (p - C) . n is the same at every
point of a plane. `computeAreas` passes the swept check on
`swept + ends` = volume within 2%, where it used `swept` alone.

What still fails the check:

- a face that leans more than 2 degrees, neither level nor standing: it is in
  neither sum (test: a top raked by a sloped cut misses by 9.8%);
- a plane that faces the centre but was dropped from the faces because its
  area spreads too far from the foot of the perpendicular (the half-ring rule,
  [half-round-ends-2026-11-23.md](half-round-ends-2026-11-23.md)): it is not
  added to `ends`, so the check catches a face patch that was wrongly left
  out.

## Checks (engine.test.mjs)

The quarter ring of the signed-fan note (30 chords, base 0 to 0.75 m between
r 1.877 and 2.3, wall above to 3.97 m between r 2.2 and 2.3), both ends cut at
x = 0.6 and y = 0.6.

| Body | swept / V - 1 | (swept + ends) / V - 1 | faces vs hand-clipped chords | end area vs clipped outline |
|---|---:|---:|---|---|
| boolean difference of two boxes from the drawn fan | +0.285 | < 1e-9 | outer, inner to 1e-9 | to 1e-9 |
| as a file: two `IfcExtrudedAreaSolid` items of clipped `IfcPolyline` rings | - | passes (`side.stepped`) | outer, inner, mean to 1e-6 | - |
| the uncut wall (ends along a radius) | 0 | ends < 1e-9 x V | unchanged | - |
| the wall with its top raked by a sloped cut | - | +0.098, refused | - | - |

The expected faces are each chord's length left inside x >= 0.6, y >= 0.6
times its item's height, and the end area is the clipped outline's edges on
the two cut lines times the height. Both are worked out independently of
the engine, in the test.

## The public models

**Data.** The 28 `.ifc` files in `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (blob-less sparse clone, not committed). They
include the four with walls the engine reads as built on an arc: ISSUE_129,
ISSUE_098, ARK_NUS skolebygg and dental_clinic. Rerun:
`node eval/curved-walls.mjs <files>`, before (main at 9d52beb45) and after.

The output is identical line for line
([curved-walls-2026-11-23-square-ends.txt](curved-walls-2026-11-23-square-ends.txt)),
still 67 of 134 measured. dental_clinic's two partitions have square-cut ends,
but they are one section all the way up and already passed the one-section
check. Every refused wall fails earlier, in `curvedFaces`, because its facets
face no one centre. No public model has a stepped arc wall with square-cut
ends, so the README claims this only on constructed walls.

## Left

- A real stepped or recessed arc wall, drawn as outlines or as a brep, to
  run both changes on (none in the public corpora searched).
- Battered walls, whose faces lean more than 2 degrees: they are not counted
  as standing, so they are neither faces nor ends.
