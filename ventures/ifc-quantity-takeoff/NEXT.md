# ifc-quantity-takeoff: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-20) (6) a real estimator's reading of the BoQ CSV (needs a person)
- (2026-11-20) next an ArchiCAD series, Lake_Mills, wall parts that stay unpaired
- (2026-11-20) (4) curved breps shipped 2026-11-20 (eval/curved-breps-2026-11-20.md): next a face round a whole surface (seam/cap), 4 unexplained, speed on MEP fittings
- (2026-11-21) thresholds per work section shipped 2026-11-20 (walls/slabs/coverings/frames, preset and --voids-up-to "a,v;slabs=0,0.05"; single pair moved slab areas on 4 of 11 models; eval/measure-sections-2026-11-20.md), next the 35 openings barely meeting their host
- (2026-11-21) overlapping shell pieces as a union

## Rooms (landed 2026-11-21, eval/rooms-2026-11-21.md)

- (landed 2026-11-21, eval/net-wall-finish-2026-11-21.md) Net wall finish per room. Left (the cut at the room's floor and ceiling landed 2026-11-21, eval/opening-height-cut-2026-11-21.md; left there: HouseZ's #27910, #56303, #68982 start 0.51 m below their room's floor, look on the model; a sloped ceiling's low side, the room top is its highest point); dental_clinic's 17 fixed windows the file names only for "2R01/2R02 ROOF" while geometry also finds the office (look at them on the model); HouseZ's 6 openings within 0.5 m of a room's box that no side test reached; curtain walls no boundary names (ARK_NUS's 852 members) from the wall face; reveals added back as a method of measurement option.
- The five unexplained ARK_NUS rooms (01109, 01170, the two M&H perimeters, 02002) drawn against their stored figures.
- Ceiling area under a sloped roof from the solid's top faces; the room grouping in the revision diff.

## Model view (landed 2026-11-21, eval/model-view-2026-11-21.md)

- (2026-11-21) Traced (eval/item-union-2026-11-21.md): overlapping body items now joined, the mesher's 5 um cut fixed, polyVolume about the piece. Left: Mini Project beams #32178/#32308 at 0.51-0.53%; `shellVolume` still sums about the model origin (check far-off faceted models); the 2 ARK_NUS items too detailed to join.
- Meshing in a Web Worker landed 2026-11-21 (eval/view-worker-2026-11-21.md: stalls over 100 ms 59 to 3-4 on ARK_NUS); the takeoff itself moved into the same worker 2026-11-21 (eval/takeoff-worker-2026-11-21.md: the page gets the rows without the solids and no longer reads the model a second time); next: split the one remaining long task when the result first shows (rows deserialised plus the tables built in one go, 0.7 s on ARK_NUS) into slices, and trace the 250-300 ms stalls left while drawing. (Storey visibility and a section plane landed 2026-11-21, eval/storeys-and-sections-2026-11-21.md; next there: capped cut faces, a straight-down camera for plan cuts. The `space` field in the element CSV and as a BoQ grouping landed 2026-11-21 with the room schedule, eval/rooms-2026-11-21.md.)
- (landed 2026-11-21, eval/display-thinning-2026-11-21.md) Extruded profiles' outlines thinned for display (Mini Project 1.82M to 416k triangles, all 11 models 6.69M to 5.07M, volume check unchanged). Left: the general method's cut members keep 360-segment arcs (192k on Mini Project); kleine_Wohnung's 1.45M triangles are 136 faceted bodies as the exporter wrote them (a display decimator for triangulated face sets).
- (2026-11-21) (3) the unexplained disagreements (NetVolumes 233 to 6 2026-11-21: Tekla sections, stair totals, ArchiCAD frames stored without glass, eval/glazing-left-out-2026-11-21.md; cross-sections 77 to 2 2026-11-20: half-surface mullions, prism axis for faceted members; eval/cross-sections-2026-11-20.md)

## From quality audit 2026-11-22 ([audit](../../portfolio/quality/audits/2026-11-22-ifc-quantity-takeoff.json))

- (landed 2026-11-22, eval/member-length-weight-2026-11-22.md) Steel length and mass from geometry, BoQ "no length"/"no weight" notes, and host-figure lengths. The ellipse, offset revolve and CENTI tests landed too (all three mutants now fail the suite). Left: 327 unexplained length pairs (Tekla "DIA-*" braces in M3D-CON-CD, which are reference-line lengths; ARK_NUS's 0.55 m shared figure; Mini Project embedded parts); steel named only by a paint colour (ARK_NUS's 829 "RAL 9004" members); length checks in the page's checks panel (CSV only today).
- (landed 2026-11-22, eval/linear-placement-2026-11-22.md) IfcLinearPlacement on gradient curves (lines, arcs, clothoids) and IfcSectionedSolidHorizontal lofts: Viadotto Acerno reads, 6,448 of 6,448 volumes; placements = IfcOpenShell to 1.1e-7 m, lofts = an independent integral to 0.003%. Left: cant (IfcSegmentedReferenceCurve) and the other IFC 4.3 spirals; span 4's 12 diaphragms lofted 0.20 m past their directrix (IfcOpenShell stops at the end: which is meant?); a second public IFC4X3 bridge or road model; planRect over long lofted railings (3 of the 12 s).
- A stored NetVolume that disagrees with the geometry for no named cause is still the figure the BoQ sums (qto.mjs:1236); revolved solids carry no bounding box, so their Uniformat basis says "geometry not read" (uniformat.mjs:284).

## buildingSMART IFC4.3 samples (landed 2026-11-22, eval/bsi-samples-2026-11-22.md)

- Cant: `segmented-reference-curve` is buildingSMART's own IfcSegmentedReferenceCurve sample (an alignment with cant, no element on it). Read it in alignment.mjs and check its stations against IfcOpenShell, then place parts on it.
- A rebar schedule: the BoQ groups bars by type today; estimators order by bar mark, diameter and shape code (BS 8666 / ACI 315), with a cut length per bar. The type's NominalDiameter and BarLength, the bar's role and the directrix's bends give all of it.
- Swept disks have no faces: the model view does not draw a bar and its world box is empty. A tube mesh for display (keeping the exact pi r^2 L volume).
- `IfcGridPlacement` offsets are read as offset curves to the left of each axis's direction (IfcOffsetCurve2D's sense); IfcOpenShell 0.9 builds no grid-placed element to check against. Find a public model with offset grid placements.
