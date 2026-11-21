# ifc-quantity-takeoff: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-20) (6) a real estimator's reading of the BoQ CSV (needs a person)
- (2026-11-20) next an ArchiCAD series, Lake_Mills, wall parts that stay unpaired
- (2026-11-20) (4) curved breps shipped 2026-11-20 (eval/curved-breps-2026-11-20.md): next a face round a whole surface (seam/cap), 4 unexplained, speed on MEP fittings
- (2026-11-21) thresholds per work section shipped 2026-11-20 (walls/slabs/coverings/frames, preset and --voids-up-to "a,v;slabs=0,0.05"; single pair moved slab areas on 4 of 11 models; eval/measure-sections-2026-11-20.md), next the 35 openings barely meeting their host
- (2026-11-21) overlapping shell pieces as a union

## Model view (landed 2026-11-21, eval/model-view-2026-11-21.md)

- Trace the 126 ARK_NUS elements (furnishing first, drawn at 56% of the computed volume) and Mini Project beam #1717 (11.8% over) whose drawn boundary disagrees with the computed volume; the general method's coplanar-ownership rule is the first suspect.
- Meshing in a Web Worker, so a 56 MB model (35 s of meshing) does not slow the page between slices; storey visibility and a section plane.
- Cap the round tubes' 360-segment arcs for display only (Mini Project: 1.8M triangles, most from CHS members).
- (2026-11-21) (3) the unexplained disagreements (NetVolumes 233 to 6 2026-11-21: Tekla sections, stair totals, ArchiCAD frames stored without glass, eval/glazing-left-out-2026-11-21.md; cross-sections 77 to 2 2026-11-20: half-surface mullions, prism axis for faceted members; eval/cross-sections-2026-11-20.md)
