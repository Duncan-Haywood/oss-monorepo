# Holes added back, faces averaged, walls on an arc: 117 unexplained stored areas to 14, 2026-11-22

Follows [cross-sections-2026-11-20.md](cross-sections-2026-11-20.md), which
left 117 of the 12,167 stored areas on the eight public models with no named
cause: 41 slab and covering GrossAreas, 31 NetAreas, 28 wall GrossSideAreas,
15 NetSideAreas and C20's two column sections. 103 of the 117 now have one,
and the cause in each case is a figure the file or the geometry gives
exactly (to 0.5%, most of them to four or more digits), not a fitted constant.

**Data.** The same eight models (`opensourceBIM/IFC-files` `HHS Office/`
construction and architect; `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` AC20-FZK-Haus, C20-Institute-Var-2,
ISSUE_159_kleine_Wohnung_R22, ISSUE_021_Mini Project, schependomlaan,
ISSUE_068_ARK_NUS_skolebygg), blob-less sparse clones, not committed. Rerun:
`node eval/areas-vs-stored.mjs <8 files> --list 100 --json eval/areas-vs-stored-2026-11-22-faces.json`
(output in `areas-vs-stored-2026-11-22-faces.txt`).

## 1. ArchiCAD's slab GrossArea is the outline: 14 slabs

schependomlaan's 14 unexplained slab GrossAreas (floor fields, a cast floor,
flat and pitched roof decks) each store:

    GrossArea = NetArea + "Holes Surface Area"

to the last digit: #43828 27.3178 + 96.1443 = 123.4621 m2, #700118 12.1992 +
0.9488 = 13.1481, #795296 (a pitched roof deck) 21.9152 + 6.1736 = 28.0888,
and so on for all 14. The holes are in the slab's own profile, not
`IfcOpeningElement`s (the elements have no openings), so the cut from the
geometry is already net of them and has no "gross" to compare. ArchiCAD's
gross is the slab's outline before its holes, and its NetArea is one of the
faces the engine already cuts (for the pitched decks the top face, for the
floor fields the underside).

Rule (`holes-added`): a stored GrossArea equal to the cut area, the net cut
or either face cut plus the file's own `Holes Surface Area` (> 0), within
0.5%. The stored figure is kept (it is a real outline area). 14 of 14.

## 2. A side area that is the mean of the two faces: 12 walls

schependomlaan's knee walls (`knieschot`) are trimmed under the roof, so the
outside and inside faces differ in height: #846800's faces cut from the
geometry are 0.0773 and 0.0449 m2, and it stores 0.0611 = their mean. The
2026-11-20 `faces-averaged` rule found this only through ArchiCAD's German
property names (C20); this model writes them in English. The rule now also
takes the two faces as cut from the geometry, when they differ by more than
2%, so it needs no property names. 10 knee walls and 2 timber frame elements
(`HSB-element` #835684 and #839799): 12 GrossSideAreas and 15 NetSideAreas
(three HSB elements' gross figures stay unexplained, below).

## 3. Coverings drawn with the wall tool: 10 coverings

schependomlaan's façade insulation (`gevelisolatie`), wall tiling
(`wandtegelwerk`) and two roof upstands (`dakopstand` #994616, #1017584 and
their copies) are `IfcCovering`s that carry ArchiCAD's *wall* quantities
("Length of the Wall at the Center", "Thickness", "Area of the Wall"). The
GrossArea they store is the wall's plan, centre length x thickness:
#62352 1.1961 x 0.074 = 0.0885 m2, #994616 3.0781 x 0.3286 = 1.0115. That is
the existing `centre-line` cause (a nominal length x width) read from these
names. The geometry differs from it by 6.6-9.2% on the insulation (the strips
are mitred at corners) and completely on the upstands, which are wedges 0 to
40 mm thick: a horizontal cut through a wedge is a sliver. The stored figure
is kept, as for walls. 20 GrossArea and 20 NetArea pairs.

## 4. One face of the body: 4 coverings and 4 corbels

A sill (`vensterbank` #868801) is extruded along its length, so the cut is
its 0.0044 m2 end profile; it stores 0.6777 m2, which is its underside: the
body's faces summed plane by plane (`planeAreas`, `geom.mjs`, the per-plane
part of `surfaceArea`) give 0.677710 m2 for that plane. The same holds for
three roof upstands (#441525 and copies, one sloped face, 0.0894 m2) and for
Mini Project's four corbels (`KONZOLE`, an `IfcSlab` extruded 370 mm sideways:
NetArea 0.0925 = 0.37 x 0.25 m, one side face, where the profile is 0.0531).
Rule (`a-body-face`): a stored slab, plate, covering or roof area equal to one
plane's face area of the body within 0.5%. It needs a body that is a single
convex piece or a closed shell (the same terms as `surfaceArea`). 4 GrossArea
and 8 NetArea pairs.

## 5. Walls on an arc: 10 walls

ARK_NUS's 10 remaining GrossSideAreas are Revit walls built on a quarter
circle: leca block walls, a ventilation room's walls and its cornice. A plane
cut through such a wall is a chord's elevation (0.7573 m2 against a stored
2.5918), and the thinnest direction the engine picks is meaningless (0.821 m
against a 0.25 m wall). Every one stores its **outer** face, exactly:

| Element | Type | Length m | Width m | Height m | plane cut m2 | centre x H | outer arc x H | stored | outer/stored |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| #1453862 | YVL 1.1 250mm leca isoblokk | 3.2594 | 0.25 | 0.75 | 0.7573 | 2.4446 | 2.5918 | 2.5918 | 0.000% |
| #1453999 | YVL 1.1 250mm leca isoblokk | 3.2594 | 0.25 | 0.75 | 0.7575 | 2.4446 | 2.5918 | 2.5918 | 0.000% |
| #1454129 | YVL 1.1 250mm leca isoblokk | 3.2594 | 0.25 | 0.75 | 0.7575 | 2.4446 | 2.5918 | 2.5918 | 0.000% |
| #1454265 | YVL 1.1 250mm leca isoblokk | 3.2594 | 0.25 | 0.75 | 0.7575 | 2.4446 | 2.5918 | 2.5918 | 0.000% |
| #1454401 | YV 12.1 411 Ventilasjonsrom | 3.2806 | 0.423 | 3.97 | 7.3917 | 13.0240 | 14.3429 | 14.3429 | 0.000% |
| #1455870 | YV 12.1 411 Ventilasjonsrom EI 60 | 3.2806 | 0.423 | 3.97 | 7.3913 | 13.0240 | 14.3429 | 14.3429 | 0.000% |
| #1457319 | YV 13.1 313 Gesims Ventilasjonsrom | 3.3670 | 0.313 | 0.82 | 1.0569 | 2.7609 | 2.9625 | 2.9625 | 0.000% |
| #1457449 | YV 13.1 313 Gesims Ventilasjonsrom | 3.3670 | 0.313 | 0.82 | 1.0571 | 2.7609 | 2.9625 | 2.9625 | 0.000% |
| #1457579 | YV 13.1 313 Gesims Ventilasjonsrom | 3.3670 | 0.313 | 0.82 | 1.0571 | 2.7609 | 2.9625 | 2.9625 | 0.000% |
| #1457715 | YV 13.1 313 Gesims Ventilasjonsrom | 3.3670 | 0.313 | 0.82 | 1.0571 | 2.7609 | 2.9625 | 2.9625 | 0.000% |

Outer arc = (Length + Width/2 x pi/2) x Height, Length being Revit's centre
line, and a 90 degree arc, which the walls' faces show (their side faces turn
through 90 degrees in about 1 degree steps). `node eval/curved-walls.mjs
<ARK_NUS file>` prints the table (`curved-walls-2026-11-22.txt`).

Detection (`bendsInPlan`, `geom.mjs`): the wall's faces that stand along its
up direction, leaving out the ones facing across its thickness direction,
face 12 or more directions **and** no one direction carries half their area.
The second condition matters: schependomlaan's stud walls #79982 and #275217
have an arched cut-out whose small faces face 14 directions, but their two
flat faces carry 98% of the area. On the eight models plus duplex and
dental_clinic, the flag is set on the 12 ARK_NUS arc walls (two of them store
no side area) and two dental_clinic partitions (#1674, #1675, no stored side
area, not checked further), and on no straight wall. The reason is `curved`;
the stored figure is kept, since a plane cut cannot measure it.

## Result

| Stored areas (8 models) | 2026-11-20 | 2026-11-22 |
|---|---:|---:|
| GrossSideArea unexplained | 28 | **6** |
| NetSideArea unexplained | 15 | **0** |
| GrossArea unexplained | 41 | **3** |
| NetArea unexplained | 31 | **3** |
| CrossSectionArea unexplained | 2 | 2 |
| **All unexplained** | **117** | **14** |

Old code against new on the same eight files: only lines that were
`unexplained` change (diff of `areas-vs-stored-2026-11-20-sections.txt` and
`-2026-11-22-faces.txt`, timings aside); no agreeing pair and no other named
cause moved. Every new cause keeps the stored figure (`trust` stays true), so
the bill of quantities sums exactly what it summed before: this changes what
the checks panel and the element CSV say about 103 pairs, not any total.

## The 14 left

- schependomlaan's three zinc copings (`afdekker` #44220, #691798, #739532,
  GrossArea and NetArea): they store their `Bottom Surface Area`, but the
  body is a CSG difference of 183 pieces, so `planeAreas` cannot read a face
  off it (the arc band of the profile; the same copings whose volume is
  unexplained in [side-lights-2026-11-22.md](side-lights-2026-11-22.md)).
- schependomlaan's three timber frame elements #835340, #839455, #863768
  (GrossSideArea): stored 7.33 and 6.56 m2 against faces of 0.92-2.14 m2. Their
  NetSideArea is the faces' mean; the gross is near ArchiCAD's own "Gross
  Surface Area of the Wall" (7.94, 13.75) but not equal to it.
- ARK_NUS #556796, #1280178, #1483180 (GrossSideArea, 2.4%, 6.4%, 49.7%):
  straight Revit walls with openings, no cause found.
- C20's two round columns (Stütze-001, D200): CrossSectionArea 1.2566 m2 on a
  0.0314 m2 circle, 40 times it, which is also 2 x the perimeter or 0.4 pi; no
  reading is better supported than another.

## What this does not show

- `holes-added`, the knee walls' mean and the wall-tool coverings come from
  one ArchiCAD model; another ArchiCAD export with holed slabs and wall-tool
  coverings would test them.
- The arc walls are one Revit model and one arc angle (90 degrees). Revit
  storing the outer face of a curved wall is what these ten show; whether it
  does on a wall that is curved the other way round (exterior face inside the
  curve) is not known. The engine's own side area for a curved wall is still
  a plane cut: where nothing is stored (dental_clinic's #1674) the computed
  side area of a curved wall is wrong. Measuring the curved faces themselves
  is the next step.
