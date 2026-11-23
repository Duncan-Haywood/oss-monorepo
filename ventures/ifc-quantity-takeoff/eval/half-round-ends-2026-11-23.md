# Half-round walls: two ends on one plane, and openings cut at both ends, 2026-11-23

Follows [triangulated-arc-breps-2026-11-23.md](triangulated-arc-breps-2026-11-23.md),
which left ISSUE_129's two 180-degree walls refused (#36735 and #148665,
`IfcWallStandardCase`, type "IGC_MUR_EGC-TUN-VOILE-1800"). That note's
reading was that they are CSG bodies "whose cutter terms carry faces off the
material" and that "a CSG body needs its cutters clipped to the material
before its faces mean anything". This run traced it. The cutters were not
the cause.

**Data.** `ISSUE_129_N1540_17_EXE_MOD_448200_02_09_11SMC_IGC_V17.ifc` and the
three other public models from `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (blob-less sparse clone, not committed). Rerun:
`node eval/curved-walls.mjs <the four files>` (about 55 s; output in
[curved-walls-2026-11-23-half-round.txt](curved-walls-2026-11-23-half-round.txt))
and `node eval/curved-walls-axis.mjs <ISSUE_129> 36735 148665` (output in
[curved-walls-axis-2026-11-23-half-round.txt](curved-walls-axis-2026-11-23-half-round.txt)).

## What the two walls are

Each body is one `IfcExtrudedAreaSolid` of an `IfcArbitraryClosedProfileDef`:
a composite curve of an arc of radius 20.2 m from 270 to 90 degrees, a
1.8 m line, an arc of 18.4 m back, and a second line. That is a half ring,
1.8 m thick, round a centre on the wall's axis circle (radius 19.3 m),
extruded 1.55 m (#36735) and 3.85 m (#148665). Two `IfcOpeningElement` boxes
("récépage poutre de couronnement", a recess for the crown beam), each
5.29 x 5.25-5.45 m in plan, cut it right through near each end.

The engine reads a concave drawn profile as a signed fan of triangles from its
first vertex (`convexPieces`), so the body is 362 terms, 157 of them negative.
Those are the "cutters" the earlier note saw. They are only how a concave
outline is written. Their faces cancel plane by plane, as they should: the
inner face read before (89.597 m2) was already right.

## Why the outer face read 103.94 m2

The faces are summed plane by plane as signed area vectors, and each plane is
classed (outer, inner or neither) by where its net area's centroid lies seen
from the centre. On a half ring, **the two end faces lie on the same plane,
through the centre**. Summed as one patch, their centroid falls on the centre
itself (half-way between the ends), where the facing test is noise. Here it
said "outer", and both ends (2 x 1.8 x 1.55 = 5.58 m2) joined the outer face:
98.36 + 5.58 = 103.94, exactly the figure the earlier run saw.

The openings do the same thing again on the net body. Both cut the ring with
the same two planes (x = 5.67 and x = 10.95 m in the profile's frame), one
patch north of the centre and one south. Summed, each pair's centroid lands
on the foot of the perpendicular from the centre, where a plane of the face
would sit, so the cuts at 10.95 m (6.78 m2) read as inner face and the cuts
at 5.67 m (5.84 m2) as outer, later dropped as hidden by the ray test.

Classing each loop by its own centroid does not fix it (tried): the fan's
triangles cross the hollow, so a plane's loops are scattered over it, and
the parts come out with negative area.

## The change (`curvedFaces`, `geom.mjs`)

A facet of a curved face lies round the foot of the perpendicular from the
centre to its plane. Ends do not, and neither do two patches either side of
that foot. So each plane's **spread** is measured: the RMS distance of its
signed area from the foot, along the plane and across `up` (the second
moment of each loop, signed as the loop is, in the plane's own coordinates).
A plane counts toward a face only when that RMS distance is no more than its
distance from the centre (45 degrees seen from the centre), on top of the
existing 25-degree test on its centroid.

A true facet passes easily: a 1-degree chord's RMS is 0.5% of its distance,
and an ArchiCAD 45-degree chord's 24%. A plane through the centre (h = 0)
fails whatever its area. The two opening cuts at 10.95 m have an RMS of about
16 m against 10.95 m and fail.

## 1. The two walls, against their own axis

| Wall | Axis radius m | Arc deg | Height m | Mid radius m | Width m | Outer: measured / arc x H m2 | Inner: measured / arc x H m2 | Passed on |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| #36735 | 19.3000 | 180 | 1.550 | 19.2993 | 1.7999 | 98.362 / 98.360 | 89.597 / 89.595 | one section |
| #148665 | 19.3000 | 180 | 3.850 | 19.2993 | 1.7999 | 244.319 / 244.312 | 222.548 / 222.542 | one section |

The width is the type's 1800 mm to 0.1 mm, and the faces are the
axis figure to 0.003% (the chords' shortfall is smaller than the
"radius +- width/2" rounding). Both pass the stricter one-section check,
mean face x width = volume: 93.9796 x 1.7999 = 169.15 m3 against a body of
169.157 m3.

**Net of the two openings** (volume 136.230 and 377.507 m3):

| Wall | Net outer m2 | Net inner m2 | Mean x width / net volume |
|---|---:|---:|---:|
| #36735 | 80.272 | 71.074 | 136.21 / 136.23 |
| #148665 | 220.771 | 198.717 | 377.52 / 377.51 |

The openings take 18.09 m2 off #36735's outer face and 18.52 m2 off its inner
one. By hand, the outer arc between x = 5.67 and 10.95 m is 5.81 m long at
each end, 18.0 m2 over 1.55 m; the inner, 5.93 m, 18.4 m2.

## 2. Nothing else moved

`curved-walls.mjs` on all four models differs from the previous run's output
([curved-walls-2026-11-23-breps.txt](curved-walls-2026-11-23-breps.txt)) on
these two rows only. A second dump of every curved wall's net side area and
net faces before and after the change
([half-round-net-diff-2026-11-23.txt](half-round-net-diff-2026-11-23.txt),
134 walls) also differs on these two rows only.

| Model | Flagged as bending | Measured before | Measured now |
|---|---:|---:|---:|
| ARK_NUS | 12 | 12 | 12 |
| dental_clinic | 2 | 2 | 2 |
| ISSUE_098 | 36 | 24 | 24 |
| ISSUE_129 | 84 | 27 | 29 |
| **All** | **134** | **65** | **67** |

On the bill: the two walls' side area goes from the chord cuts' 22.83 m2
(6.55 + 16.28; #36735's net cut read 0, the plane passing through an opening)
to 327.41 m2 gross and 285.42 m2 net. Neither stores a side area. No volume
moves.

## Tests

`engine.test.mjs`, "a half ring's coplanar ends and paired opening cuts are on
neither face": a 180-degree ring of 180 chords per arc built the way the
engine builds a drawn profile (a signed fan, negative terms included), whose
faces must equal its chord chains x height exactly, and the same ring with
two box openings cut by shared planes, whose net faces must equal the chains
less what lies between the planes. It fails on the code before this change
(inner 95.18 against 89.60). 223 of 223 tests pass.

## What this does not show

- The swept-volume check is still kept off bodies with negative terms (a
  guard brought in on the earlier misreading). A drawn concave profile with
  a stepped section would still be refused. Not tested here: no such public
  wall is known.
- The 45-degree spread bound is set from geometry, not fitted. A wall drawn
  as a very coarse polygon (a facet over 90 degrees wide) would lose its
  facets; none of the 134 flagged walls did.
- No second tool's figure: neither wall stores a side area.
