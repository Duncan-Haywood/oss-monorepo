# buildingSMART's IFC4.3 sample models, 2026-11-22

**Question.** buildingSMART publishes one small model per concept of the IFC
4.3 standard (github.com/buildingSMART/IFC4.3.x-sample-models, commit
ef22440, 2026-10-14; 46 `.ifc` files under `models/`). How many of their
elements does the takeoff read, and does what it reads agree with an
independent kernel?

**Method.** `node eval/bsi-samples.mjs models/ ios.json` runs the takeoff on
every file. `ios.json` comes from `eval/bsi-samples-ifcopenshell.py`
(IfcOpenShell 0.9.0, world coordinates, openings subtracted, 0.5 mm / 0.05
rad meshing, each file in its own process with a 60 s limit). A pair agrees
when the volumes are within 1% and the world boxes within 2 mm. Raw output:
[bsi-samples-2026-11-22.txt](bsi-samples-2026-11-22.txt).

## Before and after

| | Elements read (of 141) | Not read |
|---|---|---|
| main before this change | 79 | 35 bars ("indexed directrix with segments"), 25 columns ("object placement IFCGRIDPLACEMENT"), 1 kerb ("body IFCFIXEDREFERENCESWEPTAREASOLID"), 1 no body |
| this change | **140** | 1 with no body (a georeferenced annotation) |

Six files hold no physical element (a boiler type, a structural analysis
model, a bare alignment with cant, three textured types); they read as empty,
as they should.

What was added (`geom.mjs`, `alignment.mjs`, `qto.mjs`):

- **Indexed directrices with arcs.** A swept disk along an
  `IfcIndexedPolyCurve` of `IfcLineIndex` and `IfcArcIndex` segments is how
  reinforcing bars are written: straight legs and bends. The arc's length
  comes from its three points (`arcLength3`: the inscribed angle at the
  middle point gives the central angle, the chord and that angle give the
  radius).
- **Rebar length and mass.** An `IfcReinforcingBar` or `IfcTendon` gets its
  cut length from the directrix, and a mass at 7,850 kg/m3 unless its
  material names GFRP, basalt, carbon, stainless or the like. Before, the
  existing steel rule could not have weighed it anyway: `isSteel` rejects
  any name with "reinforc" in it (to keep reinforced concrete out), and
  rebar materials are called "ReinforcingSteel".
- **`IfcGridPlacement`.** The crossing of two `IfcGridAxis` curves, each
  moved sideways by its offset (to the left of the axis's direction), raised
  by the third offset, in the grid's own placement; x along the first axis,
  or toward `PlacementRefDirection`. Both forms are read: IFC2X3/IFC4
  (Location, RefDirection) and IFC4X3 (PlacementRelTo first).
- **`IfcFixedReferenceSweptAreaSolid`** on a curve the alignment reader reads
  (gradient, horizontal composite, polyline), trimmed to StartParam and
  EndParam: the profile square to the 3D tangent, its x axis held toward
  FixedReference, sliced at least every 1/64 of the run and every 0.25
  degrees of turn.
- `IfcBuiltElement` and other IFC4X3 class names print word by word
  (`IfcBuiltelement` before).

## Against IfcOpenShell

115 elements were read by both. **Volumes within 1%: 110.** All five
disagreements are on IfcOpenShell's side:

| File | Here | IfcOpenShell | Why |
|---|---|---|---|
| basin-advanced-brep | 0.002044 m3 | 0.005536 m3 | The same basin is in the set as a faceted brep and as a tessellation: here 0.002038 and 0.002027 m3, and IfcOpenShell agrees with both of those. Only its advanced-brep reading is 2.7 times larger, so that is the reading that is off. |
| fixed-reference-swept-area-solid | 2,699.99 m3 | 8,550.61 m3 | IfcOpenShell sweeps the whole 950 m directrix, and its box starts at x = 0. StartParam 300 and EndParam 600 trim it to 300 m: 9 m2 x 300 m = 2,700 m3. |
| sectioned-solid-horizontal | 2,699.99 m3 | 4,500.61 m3 | The boxes agree to 0.03 mm. IfcOpenShell's lofts are open shells, so their volumes mean nothing (eval/linear-placement-2026-11-22.md). It is the same 9 m2 section over the same 300 m as the row above. |
| linear-placement-of-signal (2) | 0.101 m3 each | 1,347.66 and 1,622.34 m3 | Its world box is 0.63 x 0.57 x 2.48 m, so it holds at most 0.89 m3. |

The rebar checks out three ways. The bar volumes are within 0.014% of
IfcOpenShell's, on all 35 bars. The stirrup's cut length is 1.148 m, against
the 1,150 mm `BarLength` its type states (bar lengths are rounded to 5 or
10 mm). Its mass is 1.02 kg, which is a 12 mm bar's table figure of
0.888 kg/m times that length.

**World boxes within 2 mm: 75 of 115.** Every miss is a body that has no
faces here: 36 swept-disk bars, 1 revolved beam and the 2 signals. Their
volumes come from Pappus, not from a mesh, so they have no box. The 40th is
the fixed-reference kerb, which is trimmed where IfcOpenShell's is not.
IfcOpenShell builds none of the 25 grid-placed columns, so those have no
reference. The hand-worked tests in `rebar-grid.test.mjs` place them (the
crossing, the offsets and RefDirection), along with the bar's length and
mass and a fixed-reference sweep's volume and box.

## Left

- Swept disks, revolved solids and the signal have no faces, so they have no
  box and the model view does not draw them. A display tube for bars is
  next (NEXT.md).
- Cant: `segmented-reference-curve` is buildingSMART's own cant alignment,
  with no element placed on it. It is the test file for reading
  `IfcSegmentedReferenceCurve`.
- No public model with non-zero grid offsets was found. The offset sense
  (to the left of the axis, as `IfcOffsetCurve2D` reads it) is tested only
  by hand.
