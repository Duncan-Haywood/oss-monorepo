# A curved wall's own side area, measured on its facets, 2026-11-23

Follows [curved-and-faces-2026-11-22.md](curved-and-faces-2026-11-22.md),
which taught the engine to recognise a wall built on an arc (`bendsInPlan`)
and to keep its stored side area, because a plane cut through such a wall is a
chord's elevation, not its curved face. That note ended: "where nothing is
stored (dental_clinic's #1674) the computed side area of a curved wall is
wrong. Measuring the curved faces themselves is the next step." This is that
step.

**Data.** Four public models from `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (blob-less sparse clone, not committed):
ISSUE_068_ARK_NUS_skolebygg, dental_clinic, ISSUE_098_R8_F1_MAB_AR_M3_XX_XXX_MO_7000
and ISSUE_129_N1540_17_EXE_MOD_448200_02_09_11SMC_IGC_V17: every file in that
folder in which the engine flags a wall as bending in plan (the other 26 `.ifc`
files have none; the two `.ifczip` files were not read). Rerun:
`node eval/curved-walls.mjs <the four files>`, about 45 s; output in
[curved-walls-2026-11-23.txt](curved-walls-2026-11-23.txt).

## Method (`curvedFaces`, `geom.mjs`)

1. The wall's faces that stand along its up direction are summed plane by
   plane as signed area vectors over every term and shell of its body. The
   faces two convex pieces share cancel; an opening's cutter (a negative
   term) takes its patch off the face it crosses.
2. The centre of the bend is the point nearest every facet's normal line in
   plan (least squares, weighted by area). A facet of a circle faces its
   centre exactly, so facets more than 25 degrees off the radius (the ends,
   reveals) are dropped and the centre refitted, three times.
3. A facet facing away from the centre is on the outer face, towards it the
   inner. Each face needs at least 6 facets.
4. **Checked against the body:** a wall of one section has volume = mean
   face area x width, where the width is the difference of the two faces'
   area-weighted distances from the centre. If that misses the body's volume
   by more than 2%, the measurement is refused and the wall keeps what it had
   (the stored figure, and the `curved` reason).

When it passes, the wall's computed side area is the **mean of the two
faces** (for a wall of one height that is the centre line's area, since arc
length grows with the radius), the two faces are its `faces` (the figures the
`on-a-face`, `faces-averaged` and new `curved-face` rules compare a stored
figure with), its width is the radial thickness, and the old plane cut is kept
as `chord`.

The first version took facets up to 60 degrees off the radius. On
dental_clinic's partitions that counted both ends, which are cut square to
the plan axes and meet the radius at about 52 degrees, as outer face
(+0.21 m2), and they pulled the centre off by 0.06 m. The 25-degree limit and
the refit fixed both. The numbers below are from the final version.

## 1. Checked against the files' own arcs

The figures below come straight from the IFC entities (the profile's
`IfcCircle` radii, trim angles and extrusion depth), not from the engine:

| Wall | From the file | Outer face: file / measured m2 | Inner face: file / measured m2 | Width: file / measured m |
|---|---|---:|---:|---:|
| dental_clinic #1674 | circles 4.9354 and 5.0594 m round (3.9147, -3.1063); inner arc 77.38 deg, outer 75.14 deg (ends cut square); 0.668 m high | 4.4325 / 4.4325 | 4.4523 / 4.4522 | 0.1240 / 0.1240 |
| ISSUE_098 #628477 | axis circle 0.95 m, 180 deg, 0.1 m wide, 0.9 m high | 1.0 x pi x 0.9 = 2.8274 / 2.8274 | 0.9 x pi x 0.9 = 2.5447 / 2.5447 | 0.1 / 0.1000 |
| ISSUE_098 #1424026 | axis circle 5.9 m, 57.29 deg (1.000 rad), 0.2 m wide, 4.8 m high | 6.0 x 1 x 4.8 = 28.800 / 28.797 | 5.8 x 1 x 4.8 = 27.840 / 27.837 | 0.2 / 0.2000 |

The 0.01% shortfall on #1424026 is the facets: they are chords of the arc.
Each figure agrees to the fourth digit.

ARK_NUS's ten arc walls store their outer face (Revit's GrossSideArea), and
the outer face measured on the facets matches all ten within 0.001%: 2.5918,
14.3428 and 2.9625 m2 against stored 2.5918, 14.3429 and 2.9625. The radii
come out as 2.1999/1.9499, 2.2999/1.8769 and 2.2999/1.9869 m, so the widths
are 0.2500, 0.4230 and 0.3130 m, the stored Width to the fourth digit. The
reason for these ten pairs changes from `curved` ("a plane cut cannot measure
it, the stored area is kept") to `curved-face` ("the stored side area is its
outer or inner curved face, as summed from its facets"). They stay trusted, so
the BoQ figure for them does not change.

## 2. Which walls are measured

| Model | Flagged as bending | Measured | Refused: volume check | Refused: facets do not face one centre | Refused: too few facets |
|---|---:|---:|---:|---:|---:|
| ARK_NUS | 12 | 10 | 2 | 0 | 0 |
| dental_clinic | 2 | 2 | 0 | 0 | 0 |
| ISSUE_098 | 36 | 24 | 0 | 7 | 5 |
| ISSUE_129 | 84 | 19 | 9 | 54 | 2 |
| **All** | **134** | **55** | **11** | **61** | **7** |

The refusals are the check doing its job:

- **Volume check, ARK_NUS #1455746 and #1457200.** These are faceted breps
  of a 0.423 m quarter ring (r 1.877 to 2.300 m, 3.97 m high, so faces of about
  14.34 and 11.71 m2). Their curved faces are triangulated with vertices at
  mid-height, and a third of the triangles lean 0.001 to 0.01 off the
  vertical, so the standing faces carry only half the area. The facet sums
  would have said 7.51 and 7.59 m2, and the volume check catches that.
- **Facets do not face one centre, ISSUE_129.** The one dumped (of 54 refused
  this way there; the others were not inspected) is a straight wall 0.8 m thick with rounded ends. Its two flat faces are
  14.66 and 15.23 m2, and its small end facets face many directions, enough
  for `bendsInPlan` to flag it. It is not on an arc, and its plane cut
  (14.93 m2) is the right side area, which it keeps.

## 3. What the bill of quantities gains

None of the 45 measured walls in dental_clinic, ISSUE_098 and ISSUE_129
stores a side area, so before this change the BoQ summed their chord cut.
The bill now sums their mean face:

| Model | Walls measured, nothing stored | Chord cut m2 (before) | Mean face m2 (now) | Change m2 |
|---|---:|---:|---:|---:|
| dental_clinic | 2 | 0.74 | 8.88 | +8.14 |
| ISSUE_098 | 24 | 102.22 | 747.64 | +645.41 |
| ISSUE_129 | 19 | 331.38 | 574.53 | +243.15 |
| **All** | **45** | **434.34** | **1,330.04** | **+896.70** |

On ISSUE_098, the BoQ CSV from the old code against the new
(`node cli.mjs <file>`) changes on five wall types and on area only: Generico
10 cm 249.66 to 278.65 m2, Generico 20 cm 402.89 to 425.72, PV002 Interrato
18,320.16 to 18,659.83, CV101 controterra 4,443.71 to 4,697.80, and CV003
Poroton -0.17 m2. That last one is a gently curved wall (#153180, chord cut
39.49 against a mean face of 39.32 m2). The changes sum to +645.41 m2, the
table's figure. No volume moves.

The eight-model stored-area check
([areas-vs-stored-2026-11-23-curved.txt](areas-vs-stored-2026-11-23-curved.txt)
against `-2026-11-22-faces.txt`) changes on two lines only: ARK_NUS's
`curved 10` becomes `curved-face 10`. No agreeing pair and no other named
cause moved.

## What this does not show

- Every stored figure checked is Revit's outer face on one model. Whether
  another tool stores the inner face, the mean, or a centre line on a wall
  that curves the other way is untested (the rule accepts either face).
- All 55 measured walls are extrusions of an arc profile; no faceted brep
  passed. Triangulated breps whose triangles lean are refused, not measured
  (ARK_NUS's 2, and 7 of ISSUE_129's 9 volume refusals, with mean x width at
  72-95% of the volume; its other 2 are extrusions of 362 pieces at 41%, not
  traced). Reading them would need the standing test loosened for
  triangles that lean off the vertical, and loosening it here gave too much
  area (16.6 m2 against about 14.3 for the outer face), for a reason not yet
  traced.
- A wall whose height changes along its arc (a raked top) still passes the
  volume check, because volume = mean face x width holds for any profile
  swept along the arc. Its mean face is then not centre length x a single
  height, but it is still the right mean.
- `bendsInPlan` flags straight walls with rounded ends (one inspected of
  ISSUE_129's 54 refused this way). They are refused here and keep their plane cut, which is correct, but
  the flag itself (and the `curved` reason a stored figure on such a wall
  would get) is too broad.
