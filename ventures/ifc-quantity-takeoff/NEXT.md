# ifc-quantity-takeoff: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-20) (6) a real estimator's reading of the BoQ CSV (needs a person)
- (2026-11-20) next an ArchiCAD series, Lake_Mills, wall parts that stay unpaired
- (2026-11-20) (4) curved breps shipped 2026-11-20 (eval/curved-breps-2026-11-20.md): next a face round a whole surface (seam/cap), 4 unexplained, speed on MEP fittings
- (2026-11-21) thresholds per work section shipped 2026-11-20 (walls/slabs/coverings/frames, preset and --voids-up-to "a,v;slabs=0,0.05"; single pair moved slab areas on 4 of 11 models; eval/measure-sections-2026-11-20.md), next the 35 openings barely meeting their host
- (2026-11-21) overlapping shell pieces as a union

## Rooms (landed 2026-11-21, eval/rooms-2026-11-21.md)

- (landed 2026-11-21, eval/net-wall-finish-2026-11-21.md) Net wall finish per room. Openings cut at the room's top landed 2026-11-21 (eval/ceiling-cut-2026-11-21.md: 56 openings, 37.1 m2; floor end and sloped ceilings left). Left: dental_clinic's 17 fixed windows the file names only for "2R01/2R02 ROOF" while geometry also finds the office (look at them on the model; not above the office's top, eval/ceiling-cut-2026-11-21.md); HouseZ's 6 openings within 0.5 m of a room's box that no side test reached; curtain walls no boundary names (ARK_NUS's 852 members) from the wall face; reveals added back as a method of measurement option.
- The five unexplained ARK_NUS rooms (01109, 01170, the two M&H perimeters, 02002) drawn against their stored figures.
- Ceiling area under a sloped roof from the solid's top faces; the room grouping in the revision diff.

## Model view (landed 2026-11-21, eval/model-view-2026-11-21.md)

- (2026-11-21) Traced (eval/item-union-2026-11-21.md): overlapping body items now joined, the mesher's 5 um cut fixed, polyVolume about the piece. Left: Mini Project beams #32178/#32308 at 0.51-0.53%; `shellVolume` still sums about the model origin (check far-off faceted models); the 2 ARK_NUS items too detailed to join.
- Meshing in a Web Worker landed 2026-11-21 (eval/view-worker-2026-11-21.md: stalls over 100 ms 59 to 3-4 on ARK_NUS); the takeoff itself moved into the same worker 2026-11-21 (eval/takeoff-worker-2026-11-21.md: the page gets the rows without the solids and no longer reads the model a second time); next: split the one remaining long task when the result first shows (rows deserialised plus the tables built in one go, 0.7 s on ARK_NUS) into slices, and trace the 250-300 ms stalls left while drawing. (Storey visibility and a section plane landed 2026-11-21, eval/storeys-and-sections-2026-11-21.md; next there: capped cut faces, a straight-down camera for plan cuts. The `space` field in the element CSV and as a BoQ grouping landed 2026-11-21 with the room schedule, eval/rooms-2026-11-21.md.)
- (landed 2026-11-21, eval/display-thinning-2026-11-21.md) Extruded profiles' outlines thinned for display (Mini Project 1.82M to 416k triangles, all 11 models 6.69M to 5.07M, volume check unchanged). Left: the general method's cut members keep 360-segment arcs (192k on Mini Project); kleine_Wohnung's 1.45M triangles are 136 faceted bodies as the exporter wrote them (a display decimator for triangulated face sets).
- (2026-11-21) (3) the unexplained disagreements (NetVolumes 233 to 6 2026-11-21: Tekla sections, stair totals, ArchiCAD frames stored without glass, eval/glazing-left-out-2026-11-21.md; cross-sections 77 to 2 2026-11-20: half-surface mullions, prism axis for faceted members; eval/cross-sections-2026-11-20.md)
