# Curved walls as triangulated breps, and a wall with a duct in it, 2026-11-23

Follows [curved-side-area-2026-11-23.md](curved-side-area-2026-11-23.md),
which measured a curved wall's two faces on its facets but refused every
faceted brep: ARK_NUS's #1455746 and #1457200, and 7 of ISSUE_129's 9 volume
refusals. That note's reading was that a third of the triangles lean 0.001 to
0.01 off the vertical, so the standing faces "carry only half the area", and
that loosening the test "gave too much area (16.6 against about 14.3 m2), for
a reason not yet traced". This run traced it. The leaning triangles were half
of the story. The other half was a duct.

**Data.** The same four public models from `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (blob-less sparse clone, not committed). Rerun:
`node eval/curved-walls.mjs <the four files>` (about 50 s; output in
[curved-walls-2026-11-23-breps.txt](curved-walls-2026-11-23-breps.txt)) and
`node eval/curved-walls-axis.mjs <file> <ids>` (output in
[curved-walls-axis-2026-11-23.txt](curved-walls-axis-2026-11-23.txt)).

## What ARK_NUS #1455746 is

Its body is one closed `IfcFacetedBrep` of 169 loops. Every one of its 734
edges is met once in each direction, so the shell is watertight and
consistently oriented. Unrolling the facets that stand on r = 2.300 m round the
centre (-2.0885, 0) onto the cylinder gives an outer face of **14.3429 m2**,
with every facet facing outward. That is the figure Revit stores on the ten
sister walls. So the faces were all there.

Sorting the standing facets by their distance from the centre showed what
else is there: faces at r = 1.950 m facing outward and at r = 2.200 m facing
inward, both from z = 0 to 0.750 m, and level faces at z = 0.750 m between
them. The wall (type "YV 12.1 411 Ventilasjonsrom", a ventilation room wall)
has a **duct 0.25 m wide and 0.75 m high running along its foot inside it**.
The section is a 0.1 m outer skin and a 0.073 m inner skin under the duct, and
0.423 m of solid wall over it. Its volume is 4.888 m3, against the 5.51 m3 the
full ring would hold.

That explains both earlier readings:

- With the duct's faces counted as wall faces, the "outer" face was 14.34 +
  2.30 = 16.63 m2 (the 16.6 of the earlier note) and the "inner" one
  11.70 + 2.59 = 14.29 m2.
- The volume check (volume = mean face x width) cannot hold for a wall whose
  section changes up its height, whatever the faces are. It refused this wall
  for the wrong reason.

## The method, changed (`curvedFaces`, `geom.mjs`; `qto.mjs`)

1. **Leaning facets.** A facet counts as standing when its normal is within
   2 degrees of level (it was 0.06 degrees, |n.up| <= 1e-3). On ARK_NUS the
   triangles lean at most 0.0049 (0.28 degrees).
2. **A duct's inside is on neither face.** A facet facing away from the centre
   that is not on the outermost radius (or facing the centre and not on the
   innermost) is tested with a ray cast from its centre along its normal in
   plan. If the ray passes through more of the body, the facet lines a
   channel or recess inside the wall. It goes to `hidden` and not to either
   face. Crossings within 1e-3 of the body's size are left out, because the
   centre of a non-planar quad sits a hair off its neighbours. Without that,
   six of ARK_NUS's inner quads at r = 1.877 m read as hidden.
3. **A second volume check for such walls.** Divergence theorem in plan: half
   the sum of each facing facet's plan area times its distance from the centre
   (the inner side negative, hidden facets included) is the body's volume
   whenever its other faces are level or lie along a radius. That holds for
   any section, a stepped one or one with a duct included. A wall now passes
   when either the old one-section check or this one holds within 2%. The
   second check applies only to bodies with no cutter among their terms (see
   below).

The width is still the gap between the two faces' area-weighted radii.

## 1. ARK_NUS: checked against the wall's own axis

| Wall | Axis (from the file) | Outer face: R x angle x H / measured m2 | Inner face m2 | Width: stored / measured m |
|---|---|---:|---:|---:|
| #1455746 | circle 2.0885 m, 90 deg, 3.970 m high | 14.333 / 14.336 | 11.699 / 11.699 | 0.423 / 0.4225 |
| #1457200 | the same, type "EI 60" | 14.333 / 14.336 | 11.699 / 11.699 | 0.423 / 0.4224 |

The "R x angle x H" column uses the axis radius plus or minus half the
measured width. The outer face measured on the facets is 14.3357 m2 against
14.3429 unrolled onto the true cylinder, the chords' 0.05% shortfall. The duct's
4.89 m2 of lining is left out (`hidden`). Both walls pass on the swept-volume
check: swept 4.88999 m3 against a body of 4.88826 m3 (0.04%).

## 2. ISSUE_129: eight faceted tunnel walls

Eight more walls are measured, all `IfcFacetedBrep` walls of a tunnel
("IGC_MUR_EGC-TUN-VOILE-..."). All eight pass the old, stricter one-section
check once their leaning triangles count. Each stores nothing:

| Wall | Type thickness | Axis radius m | Measured mid radius m | Measured width m |
|---|---:|---:|---:|---:|
| #36619 | 400 | 20.0000 | 20.0138 | 0.3961 |
| #63040 | 800 | 12.5500 | 12.5500 | 0.7964 |
| #233191, #242463 | 200 | 16.0500 | 16.0727 | 0.1952 |
| #235607 | 500 | 12.5500 | 12.5480 | 0.4938 |
| #249057 | 200 | 16.0500 | 16.0673 | 0.1967 |
| #260050 | 800 | 12.5500 | 12.5489 | 0.7970 |
| #270736 | 800 | 12.5500 | 12.5487 | 0.7964 |

The mid radius lands on the axis within 0.023 m and the width within 0.4-2.4%
of the type's thickness. The faces cannot be checked as R x angle x H here:
the measured faces are 3-24% under that figure on six walls, which is what a
wall whose top steps or slopes along a tunnel gives (H is the wall's
full height). The volume check is what vouches for these eight. A
`curved-walls-axis.mjs` row for each is in the output file.

**Refused, correctly: ISSUE_129 #36735 and #148665.** These are 180-degree
`IfcWallStandardCase` extrusions, 1.8 m thick, built as 258 convex terms
*with cutters among them*. Taking the cutter faces as the body's surface put an
"inner" face at r = 10-14 m, inside the wall's own hollow, and the swept
check passed anyway, since the divergence identity holds term by term. The
inner face it reported (89.597 m2) did match the file. The outer one
(103.9 m2 against about 98.4) did not. So the swept-volume check is limited to
bodies with no cutter terms, and these two stay refused as before. A CSG
body needs its cutters clipped to the material before its faces mean anything.

## 3. What changed, all four models

| Model | Flagged as bending | Measured before | Measured now |
|---|---:|---:|---:|
| ARK_NUS | 12 | 10 | 12 |
| dental_clinic | 2 | 2 | 2 |
| ISSUE_098 | 36 | 24 | 24 |
| ISSUE_129 | 84 | 19 | 27 |
| **All** | **134** | **55** | **65** |

None of the 55 walls measured before moved. `curved-walls.mjs`'s output differs
from the previous run's only on the ten new rows. On the ten new walls, none
of which stores a side area, the bill's side area goes from the chord cuts'
134.57 m2 to their mean faces' 399.97 m2 (+265.40 m2). ARK_NUS +12.86,
ISSUE_129 +252.54. No volume moves, because only the side-area branch for
walls that bend in plan changed.

The eight-model stored-area check (`areas-vs-stored`) was not rerun. Its
curved rows are ARK_NUS's ten stored outer faces, which did not move, and the
two new ARK_NUS walls store nothing.

## Tests

`engine.test.mjs`: a quarter-ring wall of 90 convex pieces with a duct
0.25 x 0.75 m along its foot (outer and inner faces exact, the duct's two
linings `hidden`, swept = volume, and the one-section check missing by over
10%), and a closed quarter ring whose curved faces are triangulated between a
bottom ring and a top ring half a facet round, so each triangle leans
0.001-0.01 (the faces equal the triangles' own areas). Both fail on the code
before this change.

## What this does not show

- The duct was found on one wall type in one model. Other recesses (a chase,
  a niche, a stepped footing) are caught by the same ray test only when the
  hidden facet faces the centre or away from it; a recess lined at other
  angles is dropped by the 25-degree rule.
- A facet leaning more than 2 degrees (a battered retaining wall) is still not
  standing.
- ISSUE_129's 54 walls whose facets face no one centre were not looked at
  again. `bendsInPlan` still flags straight walls with rounded ends.
- No second tool's figure for a triangulated curved wall: ISSUE_129 stores
  none, and ARK_NUS's two store none.
