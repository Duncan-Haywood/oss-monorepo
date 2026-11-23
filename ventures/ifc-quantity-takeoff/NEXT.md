# ifc-quantity-takeoff: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-20) (6) a real estimator's reading of the BoQ CSV (needs a person)
- (2026-11-20) next an ArchiCAD series, wall parts that stay unpaired
- (2026-11-20) (4) curved breps shipped 2026-11-20 (eval/curved-breps-2026-11-20.md); 2026-11-22 faces meeting on the axis read and the unexplained ones traced to IfcOpenShell (eval/pole-faces-2026-11-22.md): next a face round a whole surface with no pole on it (seam cut; none in the public models now), the turned figure written by ifcopenshell-volumes.py --breps, speed on MEP fittings
- (2026-11-21) thresholds per work section shipped 2026-11-20 (walls/slabs/coverings/frames, preset and --voids-up-to "a,v;slabs=0,0.05"; single pair moved slab areas on 4 of 11 models; eval/measure-sections-2026-11-20.md), next the 35 openings barely meeting their host
- (2026-11-21) overlapping shell pieces as a union
- (2026-11-23, eval/turned-figure-2026-11-23.md) The reference script now names IfcOpenShell meshes with faces turned the wrong way. Left: kleine_Wohnung #172368 (all three figures over its box) and the not-closed #160849/#172538, looked at on the model; the 5 tessellation-gap breps (B-spline and surface of revolution, 0.17-0.29% light) refined until they pass 0.1% or the agreement line set per surface type; the same check run on the other public models with advanced breps.

## Curved walls (landed 2026-11-23, eval/curved-side-area-2026-11-23.md)

- (landed 2026-11-23, eval/triangulated-arc-breps-2026-11-23.md) Triangulated breps on an arc: ARK_NUS's two (a duct along the foot, faces matching the axis to 0.02%) and 8 ISSUE_129 tunnel walls measured, 55 to 65 of 134. (ISSUE_129 #36735, #148665 landed 2026-11-23, eval/half-round-ends-2026-11-23.md: not cutters but a half ring's two ends on one plane through the centre, and opening cuts sharing planes; a plane's spread round the foot now decides.) Left: recesses lined at other angles than facing the centre; facets leaning over 2 degrees (battered walls).
- `bendsInPlan` flags straight walls with rounded ends (one inspected of the 54 ISSUE_129 walls whose facets face no one centre); curvedFaces refuses them, but the flag (and a stored figure's `curved` reason there) is too broad.
- (landed 2026-11-23, eval/signed-fan-swept-2026-11-23.md) The swept check now takes bodies with negative terms (signed fans, boolean recesses). Left: no public model has a stepped arc wall drawn as outlines to try it on (the public corpus moved nothing); a stepped arc wall with ends cut square (neither level nor radial) is still refused, and would need the ends' own flux added to `swept`.
- A second tool's stored side area on an arc wall (only Revit outer faces checked).

## Rooms (landed 2026-11-21, eval/rooms-2026-11-21.md)

- (landed 2026-11-21, eval/net-wall-finish-2026-11-21.md) Net wall finish per room. Left (the cut at the room's floor and ceiling landed 2026-11-21, eval/opening-height-cut-2026-11-21.md; left there: HouseZ's #27910, #56303, #68982 start 0.51 m below their room's floor, look on the model; a sloped ceiling's low side, the room top is its highest point); dental_clinic's 17 fixed windows the file names only for "2R01/2R02 ROOF" while geometry also finds the office (look at them on the model); HouseZ's 6 openings within 0.5 m of a room's box that no side test reached; curtain walls no boundary names (ARK_NUS's 852 members) from the wall face; reveals added back as a method of measurement option.
- The five unexplained ARK_NUS rooms (01109, 01170, the two M&H perimeters, 02002) drawn against their stored figures.
- Ceiling area under a sloped roof from the solid's top faces; the room grouping in the revision diff.

## Model view (landed 2026-11-21, eval/model-view-2026-11-21.md)

- (2026-11-21) Traced (eval/item-union-2026-11-21.md): overlapping body items now joined, the mesher's 5 um cut fixed, polyVolume about the piece. Left: Mini Project beams #32178/#32308 at 0.51-0.53%; `shellVolume` still sums about the model origin (check far-off faceted models); the 2 ARK_NUS items too detailed to join.
- Meshing in a Web Worker landed 2026-11-21 (eval/view-worker-2026-11-21.md: stalls over 100 ms 59 to 3-4 on ARK_NUS); the takeoff itself moved into the same worker 2026-11-21 (eval/takeoff-worker-2026-11-21.md: the page gets the rows without the solids and no longer reads the model a second time); next: split the one remaining long task when the result first shows (rows deserialised plus the tables built in one go, 0.7 s on ARK_NUS) into slices, and trace the 250-300 ms stalls left while drawing. (Storey visibility and a section plane landed 2026-11-21, eval/storeys-and-sections-2026-11-21.md; next there: capped cut faces, a straight-down camera for plan cuts. The `space` field in the element CSV and as a BoQ grouping landed 2026-11-21 with the room schedule, eval/rooms-2026-11-21.md.)
- (landed 2026-11-21, eval/display-thinning-2026-11-21.md) Extruded profiles' outlines thinned for display (Mini Project 1.82M to 416k triangles, all 11 models 6.69M to 5.07M, volume check unchanged). Left: the general method's cut members keep 360-segment arcs (192k on Mini Project); kleine_Wohnung's 1.45M triangles are 136 faceted bodies as the exporter wrote them (a display decimator for triangulated face sets).
- (2026-11-21) (3) the unexplained disagreements (NetVolumes 233 to 6 2026-11-21: Tekla sections, stair totals, ArchiCAD frames stored without glass, eval/glazing-left-out-2026-11-21.md; 6 to 2 2026-11-22: side-light doors, eval/side-lights-2026-11-22.md; cross-sections 77 to 2 2026-11-20: half-surface mullions, prism axis for faceted members; eval/cross-sections-2026-11-20.md; all stored areas 117 to 14 2026-11-22: holes added back, faces averaged, wall-tool coverings, one body face, walls on an arc, eval/curved-and-faces-2026-11-22.md). Next: measure a curved wall's side from its curved faces (today a plane cut; wrong where nothing is stored, dental_clinic #1674/#1675); ArchiCAD polygon sections 2026-11-23 (arcs as 45-degree chords, round columns as circumscribed 20-gons; eval/archicad-polygon-sections-2026-11-23.md): next, a second ArchiCAD model with large-radius arcs or another column diameter to test the step and the 20-gon, and one with bent-sheet flashings for the copings' 14.27 mm2; planeAreas on CSG bodies for the 3 copings

## From quality audit 2026-11-22 ([audit](../../portfolio/quality/audits/2026-11-22-ifc-quantity-takeoff.json))

- (landed 2026-11-22, eval/member-length-weight-2026-11-22.md) Steel length and mass from geometry, BoQ "no length"/"no weight" notes, and host-figure lengths. The ellipse, offset revolve and CENTI tests landed too (all three mutants now fail the suite). Left: 327 unexplained length pairs (Tekla "DIA-*" braces in M3D-CON-CD, which are reference-line lengths; ARK_NUS's 0.55 m shared figure; Mini Project embedded parts); steel named only by a paint colour (ARK_NUS's 829 "RAL 9004" members); length checks in the page's checks panel (CSV only today).
- (landed 2026-11-22, eval/linear-placement-2026-11-22.md) IfcLinearPlacement on gradient curves (lines, arcs, clothoids) and IfcSectionedSolidHorizontal lofts: Viadotto Acerno reads, 6,448 of 6,448 volumes; placements = IfcOpenShell to 1.1e-7 m, lofts = an independent integral to 0.003%. Left: cant (IfcSegmentedReferenceCurve) and the other IFC 4.3 spirals; span 4's 12 diaphragms lofted 0.20 m past their directrix (IfcOpenShell stops at the end: which is meant?); a second public IFC4X3 bridge or road model; planRect over long lofted railings (3 of the 12 s).
- A stored NetVolume that disagrees with the geometry for no named cause is still the figure the BoQ sums (qto.mjs:1236); revolved solids carry no bounding box, so their Uniformat basis says "geometry not read" (uniformat.mjs:284).

## buildingSMART IFC4.3 samples (landed 2026-11-22, eval/bsi-samples-2026-11-22.md)

- Cant: `segmented-reference-curve` is buildingSMART's own IfcSegmentedReferenceCurve sample (an alignment with cant, no element on it). Read it in alignment.mjs and check its stations against IfcOpenShell, then place parts on it.
- Swept disks have no faces: the model view does not draw a bar and its world box is empty. A tube mesh for display (keeping the exact pi r^2 L volume).
- `IfcGridPlacement` offsets are read as offset curves to the left of each axis's direction (IfcOffsetCurve2D's sense); IfcOpenShell 0.9 builds no grid-placed element to check against. Find a public model with offset grid placements.

## Bar schedule (landed 2026-11-22, eval/rebar-schedule-2026-11-22.md)

- Hook legs as their own column, the way BS 8666 and Tekla give them (Tekla's stirrup F203_2: E = 64 mm, the straight part past the 135-degree bend; Revit's ISO shapes measure A another way): the 3 of 33 leg dimensions that miss.
- More BS 8666 shape codes than 00, 11 and 21 (links, cranks, hooks), each checked against a public bar the file codes; ACI 315 bend types for US models.
- Bars drawn as meshes or breps (paireks/T-Rex's 44 Grasshopper bars, the Norwegian Tekla detail's brep): fit a centreline to the surface.
- Tekla's DIM_L is the legs summed and rounded down to 10 mm: offer it as a second length column for Tekla projects that order by it.
- A real estimator's or bending shop's reading of the bar schedule CSV (needs a person).
