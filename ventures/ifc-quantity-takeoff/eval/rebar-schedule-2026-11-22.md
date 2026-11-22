# A bar bending schedule from the model's own bars, 2026-11-22

**Question.** Estimators and fabricators order reinforcement by bar mark:
for each mark the size, the number of bars, the cut length of each, the
shape with its leg dimensions, and the mass. The bill of quantities grouped
bars by class and type, which is not how rebar is bought. Can a schedule be
read from the bars' own geometry, and does it agree with the schedule the
authoring tool wrote on the same bars?

**Data.** Every public IFC file that GitHub code search finds with
`IFCREINFORCINGBAR` in it (284 hits, mostly test fragments) was screened
for real exports; 12 were downloaded to a scratch folder, not committed (their
repositories' licences vary). Two are Tekla Structures 2025 exports of a
real project's concrete (agustdiez/tekla-structures-hyt, an Argentine plant:
a chromatograph base and a fire wall), one is a Tekla detail
(Infrastructure-Consultancies-in-Norway/3d-details-property-mapper), one an
Allplan export of a crane foundation (OlegMoshkovich/SimpleSiteModels), two
are FreeCAD rebar2 examples carrying Allplan's attributes
(berndhahnebach/rebar2; Moult/ifc-test-files holds a copy of one, left
out), two are Revit exports (JakkeLab/Study_IFCjs, MaLabTHU/bim-r-platform),
one an IfcOpenShell-written Allplan sample (pragmaticBIM-reference), one a
Grasshopper mesh export (paireks/T-Rex), and buildingSMART's two IFC4.3
samples (reinforcing-stirrup, reinforcing-assembly). Rerun:
`node eval/rebar-schedule.mjs <files>`; raw output:
[rebar-schedule-2026-11-22.txt](rebar-schedule-2026-11-22.txt).

**The authors' own figures.** Tekla writes on every bar group its mark
(REBAR_POS), shape code (SHAPE), bars in the group, leg dimensions
(DIM_A...), a length (DIM_L) and the group's weight. Allplan writes the
position number, a shape code, the bars in the whole position, the mass per
metre and a bending diameter. Revit writes ISO 3766 shape codes and
parameters. These are what the schedule is checked against.

## Bars read

| | Bar elements read (of 310) |
|---|---|
| main before this change | 35 (buildingSMART's samples only) |
| this change | **265** |

The other 45: 44 Grasshopper bars that are triangle meshes, and one Tekla
bar drawn as a faceted brep. Neither has a path to read; the schedule names
them in its notes.

What stopped the rest on main, and what was added (`geom.mjs`):

- **Swept disks with StartParam and EndParam.** Every Tekla, Allplan and
  Revit bar has them; main refused all of them. They are now read: Tekla
  writes 0 and the directrix's whole parameter range (lines by their length,
  arcs by their angle, 120 + pi/2 + 4,579.375 on one bar); Allplan writes 0
  to 1 on a 37-piece polyline, which as parameters would cut the bar to its
  first facet, so 0 to 1 on more than one piece is read as the whole bar;
  Revit writes the range in its arcs' degrees (0 to 273 over a 1 + 180 + 1 +
  90 + 1 curve, 0 to 546 on a stirrup) and once a length (3,500 on a
  6,096 mm line whose bar is 3,500 mm long: an EndParam past the parameter
  range but within the length is a length). Anything else is cut at its
  parameters (`trimPath`).
- **Directrices in 3D.** Tekla's legs are lines running down z and arcs on
  circles placed in 3D; the length reader took trimmed curves through the
  plan-only curve reader, so a vertical leg had no length. `path3` reads
  polylines, indexed curves, trimmed lines and circles and composite curves
  as 3D lines and arcs.
- **Bars drawn as extruded circles**, including a circle written as a
  32-sided polygon (pragmaticBIM's sample).

## Against the authors' figures

| Figure | Agree |
|---|---|
| Bars in a Tekla group | 32 of 32 |
| Bars in an Allplan position (all its groups) | 24 of 24 |
| Mass of a Tekla group, within 1% | 32 of 32 |
| Allplan's mass per metre, within 1% | 20 of 20 |
| Allplan's bending diameter against the bends drawn, within 3% | 13 of 13 |
| Length | 37 of 37 |
| Leg dimensions, within 2 mm | 30 of 33 |

- **Mass.** Tekla's group weight is the bar's centreline length times the
  nominal size's mass per metre (0.617 kg/m for 10 mm): mark 21 is 16 bars
  of 4,802 mm, 47.37 kg here against Tekla's 47.40. Tekla's IFC
  `NominalDiameter` is 10.625 for a 10 mm bar (the swept disk is drawn that
  wide, ribs included); weighing the disk at 7,850 kg/m3 would put every
  Tekla bar 13% heavy. The takeoff now weighs a bar it can read by its
  nominal size, taken from the bar's properties (DIAMETER_NOMINAL, Size,
  Bewehrungsdurchmesser), else the IFC attribute. The pragmaticBIM sample
  draws its 16 mm bars 32 mm across (the radius written as the diameter):
  4 times the steel by volume, the nominal figure by this rule.
- **Length.** Tekla's DIM_L is not the cut length: it is the leg
  dimensions summed and rounded down to 10 mm (A 328 + B 2,250 + C 328 =
  2,906, DIM_L 2,900; so on 26 of the 27 Tekla lines with a DIM_L, and the
  27th, stirrup F203_2, states 1,680 mm against a cut length of 1,694 here).
  The schedule's "length of each bar" is the cut length along the
  centreline (4,802 mm for the bar above, whose legs are 4,650 + 190), the
  steel that is cut and the length Tekla's own weight uses. Revit and the
  others state the cut length, and agree.
- **Leg dimensions** are measured out to out, as BS 8666 and Tekla do: the
  straight run plus (r + d/2) tan(theta/2) at a bend of theta <= 90 degrees,
  r + d/2 past one (r the centreline radius, d the nominal size). Tekla's
  are matched within 2 mm on 28 of the 29 lines that state them (mostly
  within 1 mm). The three misses are hooks: Tekla's stirrup F203_2 gives its
  135-degree hooks as E = 64 mm, the straight part beyond the bend (here
  88 = 64 + r + d/2), and Revit's two hooked shapes measure their hook leg
  another way (A = 114 against 100 and 81 here). Hook conventions differ by
  standard; a hook column is the next step.
- **Bend radius.** Allplan draws a bend as eight facets with their vertices
  on the bend's circle. Their length over the turn reads the radius 7% small
  (52 mm inside diameter against Allplan's 56 on the crane foundation), so a
  bend drawn in facets takes the radius of the circle through its vertices:
  56.0 against 56, 64.0 against 64. On the two FreeCAD rebar2 files the
  attribute named "Bending diameter" equals the drawn bend's inside
  radius, not its diameter (72 mm inside diameter where it says 36), on all
  9 lines; which one the bending shop would use, the file cannot say.
- **Shapes.** A BS 8666 shape code is given for the three shapes read with
  certainty: 00 straight, 11 one 90-degree bend, 21 two 90-degree bends the
  same way in one plane. Tekla's own codes on those lines: F101 on the 6
  straight ones, F102 or F104 on the 3 L's, F105 on the 14 U's; F105 is
  also on a Z-shaped bar, so a Tekla code is the project's own catalogue,
  not a BS 8666 code. Other shapes are described (Z
  cranked, closed link with n bends, n bends not in one plane) and the
  file's own code is kept beside it.
- **BS 8666's minimum bend.** A bend whose inside radius is under BS 8666's
  minimum scheduling radius for B500 (2d to 16 mm, 3.5d from 20 mm) is
  noted: Tekla mark 15 (16 mm bars bent to a 20 mm inside radius, ADN-420
  steel under Argentina's rules) and the FreeCAD files' 18 mm bars. The
  note names the standard; it is not a judgement on the project's own code.

## Not done

- Hook legs as a column of their own, read the way BS 8666 and Tekla give
  them (E beyond the bend).
- Shape codes beyond 00, 11 and 21, and the ACI 315 bend types.
- Bars drawn as meshes or breps (the Grasshopper set, the Norwegian Tekla
  detail): a centreline would have to be fitted to the surface.
- A real estimator's or bending shop's reading of the CSV (needs a person).
