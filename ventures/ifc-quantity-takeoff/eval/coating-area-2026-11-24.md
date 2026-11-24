# A coating column for steel: every outside face, checked on 30 public models, 2026-11-24

**Question.** [split-held-2026-11-24.md](split-held-2026-11-24.md) found that
Tekla writes a plate's `NetArea` as the sum of every face of its body, which is
the area a painter or galvaniser prices, and left "a BoQ column for coating
area" open. An estimator pricing structural steel needs that figure for every
steel part, not only for the plates where Tekla happens to store it. Can the
bill of quantities give it from the geometry, and does it agree with what
authoring tools store?

**Data.** The 28 `.ifc` files in `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (the two `.ifczip` files were not run) and
`opensourceBIM/IFC-files` "HHS Office" architect and construction. These are
blob-less sparse clones and are not committed. 8 of the 30 models have steel
parts in the framing classes.

**Method.** `coatingArea(row)` in `qto.mjs` returns a coating figure for a
part whose class is a beam, column, member, plate, pile, railing or stair
flight and whose material reads as plain steel (`isSteel`, the same test the
steel weight uses). Bars, tendons, ducts and fasteners are left out. The
figure comes from the first of these that applies:

1. **The body's own faces** (`surfaceArea`, plane by plane), when the body is
   one convex-or-faceted piece.
2. **The extruded profile's outline** (`profileSkin`), when the body is one
   `IfcExtrudedAreaSolid`, possibly reached through a mapped item and possibly
   clipped by half-spaces. Each profile edge is swept along the extrusion
   vector (|edge × depth|) and both ends are added. A clipped body's sides are
   scaled by its volume over the unclipped extrusion's. The route is rejected
   when an unclipped body's volume is not the extrusion's within 0.5%, which
   catches a scaled mapping.

   This route exists because a profile with root radii is cut into hundreds
   of convex pieces (duplex's W410X60: 371), and those pieces' faces cannot be
   summed one by one. I first tried the exact boundary that the 3D view draws
   (`termBoundary` in `view-mesh.mjs`). It passed its volume check, but it
   doubled one web face of a W410X60 (10.17 against 7.03 m2 on two identical
   4.121 m beams). It is a display routine and was not used.
3. **A stored whole-skin figure**: `OuterSurfaceArea`, `GrossSurfaceArea` or
   `NetSurfaceArea`, or a plate `NetArea` that `explainAreas` named
   `whole-surface`. It is used only when the geometry gives nothing. Where
   both exist they are compared at 2%, and the line counts the ones that
   disagree.

The figure is the outside. A hollow section's bore (the holes in its profile)
is summed in a column of its own, because galvanising coats it and paint and
fire protection do not.

`node eval/coating-area.mjs <files> --json out.json`;
output: [coating-area-2026-11-24.txt](coating-area-2026-11-24.txt),
[coating-area-2026-11-24.json](coating-area-2026-11-24.json).

## Result

| model | steel parts | from geometry | stored only | none | stored skin beside geometry | agree within 2% | coating m2 | steel kg | m2 per tonne |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ISSUE_021_Mini Project (Tekla) | 177 | 175 | 2 | 0 | 175 | 109 | 605.09 | 10,323 | 58.6 |
| ISSUE_068_ARK_NUS_skolebygg | 1 | 1 | 0 | 0 | 1 | 1 | 1.64 | 56 | 29.5 |
| ISSUE_102_M3D-CON-CD (Tekla) | 63 | 63 | 0 | 0 | 63 | 35 | 60.66 | 20,596 | 2.9 |
| ISSUE_126_model | 1 | 1 | 0 | 0 | 0 | 0 | 5.71 | 143 | 39.8 |
| S_Office_Integrated Design Archi (Revit) | 306 | 278 | 0 | 28 | 0 | 0 | 1,968.53 | 182,883 | 10.8 |
| duplex (Revit) | 8 | 8 | 0 | 0 | 0 | 0 | 63.11 | 2,653 | 23.8 |
| example (Revit) | 73 | 73 | 0 | 0 | 0 | 0 | 183.19 | 7,687 | 23.8 |
| schependomlaan (ArchiCAD) | 196 | 196 | 0 | 0 | 56 | 40 | 227.69 | 9,069 | 25.1 |
| **8 models** | **825** | **795** | **2** | **28** | **295** | **185** | **3,115.61** | **233,411** | |

**797 of 825 steel parts get a coating area**, 795 of them from their
geometry. Before this change the BoQ had no such column. Tekla's `NetArea`
was the only place a skin figure surfaced, and only on M3D-CON-CD's 7 plates.

**Checked against published section tables.** The figures per metre of member
agree with the external surface areas that steel tables list (the ends add
less than 0.3% at these lengths):

| part | here, m2/m | from the section's dimensions or table |
|---|---:|---|
| example `310UC96.8` column | 1.794 | 1.79 (Australian UC table) |
| example `300PFC40.1` beam | 0.934 | 0.93 (Australian PFC table) |
| duplex `W410X60` | 1.485 | 1.48: 4 x 178 + 2 x 407 − 2 x 7.7 mm, less the four root radii |
| duplex `W310X60` | 1.371 | 1.37, same working |
| Mini Project `B193.7/8` tube | outside π x 0.1937 = 0.609 | Tekla's stored OuterSurfaceArea agrees on all 6 |

**Hollow sections.** Mini Project's six `B193.7/8` columns at first read twice
Tekla's figure (35.38 against 18.47 m2) because the faces include the bore.
They now take the outside from the profile and agree. Their bore,
16.90 m2, is reported apart, as is the bore of example's 17 `100x6.0SHS`
beams (15.87 m2).

**Where the stored figure disagrees** (110 of 295 pairs, 77.7 m2 stored
against 80.0 m2 from geometry, 2.6% of the coating summed on those models):

- schependomlaan's 15 `stripstaal 80/8` flat bars (ArchiCAD) store 0.90 to
  0.91 of their faces. That ratio is 160/176: the stored figure is the two
  80 mm faces times the length, without the two 8 mm edges or the ends.
  (#737154: 0.0992 stored = 0.16 x 0.62 m; faces 0.176 x 0.62 + 2 x
  0.00064 = 0.1104.) The edges are painted too, so the column sums the faces.
- M3D-CON-CD's 28 `BOTTOM_PART` pieces (under 0.034 m2 each, 0.27 m2 stored
  against 0.40 m2 in all) store about two thirds of their faces. The cause is
  not named.
- Mini Project's 54 cast-in parts (`INGIETSTUK`, `INGIETSTUKONDERDEEL`, 2 to
  3% over, 0.92 m2 in all), 3 `LIGGER` beams (2.6% under, 66.20 against
  67.95 m2), 5 `KOKER` box pieces, 2 `OPLASSTUK` and 2 `KIKKERPLAAT`. Not
  named.

**Not covered.** S_Office's 28 coped beams (`Steel Universal Section 250 x
250`), each an extrusion with `IfcFacetedBrep` cut-outs subtracted by
`IfcBooleanResult` DIFFERENCE. Their bodies are hundreds of signed pieces and
none of the three routes reads them. The line says "28 steel parts with no
coating area".

## What this does not show

- That an estimator's method of measurement counts the ends. Most paint and
  galvanising specifications price the whole outside. The ends of a member are
  under 0.3% of a beam's skin here, but they are not under 0.3% of a short
  cleat's.
- That the clipped-member scaling is exact. It assumes the end cuts shorten
  every side alike. A skewed cut or a cope does not, and the ends are counted
  at the profile's area, not the cut's. It was checked on one synthetic beam
  (`engine.test.mjs`, "a filleted I section's skin"), not against a stored
  figure on a clipped member.
- Whether the m2-per-tonne figures are typical. M3D-CON-CD's 2.9 is a handful
  of 119 mm plates, and S_Office's 10.8 is heavy universal sections.
- Weights in the table are the BoQ's: the stored weight where there is one,
  else volume x 7,850 kg/m3.
