# ifc-quantity-takeoff: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-20) Areas from geometry shipped 2026-11-19 (plane sections: wall side and footprint, slab plan, member cross-section; eval/areas-vs-stored-2026-11-19.md); faceted bodies cut through their faces 2026-11-20 (2,915 of 4,251 new pairs agree; eval/areas-vs-stored-2026-11-20.md); their misses named 2026-11-20 (unexplained 1,499 to 358; eval/faceted-causes-2026-11-20.md); joined walls (ArchiCAD finishes areas) and copied curtain-wall figures named 2026-11-20 (unexplained 358 to 192; eval/joins-and-host-figures-2026-11-20.md); revision change report shipped 2026-11-20 (diff.mjs, page and cli --compare: BoQ change per line, elements matched by GlobalId, Tag, geometry, Revit parts/host paired; 190 of 1,011 GlobalId-only adds/removes on five real Aalseth Residence exports were the same element; eval/revision-diff-2026-11-20.md)

## 2026-11-20: slabs that are roofs, finishes or sun shades

Slabs typed FLOOR are read by type name (finish floors to C3020, stair tiles
to C2020, Sonnenschutz fins to B2010, "plat dak"/"dakvloer" to B1020) and
then as the roof by geometry (nothing over it, walls or columns under it, no
storey's walls on it). 17 models: 474 codes changed, authors' codes unchanged
(482 of 588 at level 3); 18 more roof slabs and 142 more frame members in
B1020. eval/slab-roles-2026-11-20.md.
- (moved 2026-11-20) (5) change report on a second house shipped 2026-11-20 (Lake Kegonsa, 5 Revit exports: 138 GlobalId-only adds/removes the same element; a faulty 'INCH' of 3.6576 m repaired by name, qto.mjs NAMED_UNITS; eval/units-repair-2026-11-20.md)

## 2026-11-21: the unexplained GrossVolumes, 159 to 34

Two causes named in `explainChecks`: `body-is-net` (105 schependomlaan walls
and slabs whose faceted geometry already has the openings cut; it equals the
stored NetVolume) and a compound unit slip, litres over the square-foot factor
(20 skolebygg slabs, 92.903 times their geometry, counted only when three or
more share the factor). skolebygg's slab volume in the BoQ: 134,776 m3 to
11,086 m3. eval/stored-vs-computed-2026-11-21.md.
- (moved 2026-11-21) 3D model view 2026-11-21 (viewer.mjs, view-mesh.mjs; eval/model-view-2026-11-21.md)
- (moved 2026-11-21) Uniformat II grouping shipped 2026-11-20 (uniformat.mjs, --by uniformat; rules vs authors' codes 482 of 588 at level 3, held-out 66 of 69; eval/uniformat-2026-11-20.md), envelope from geometry shipped 2026-11-20 (envelope.mjs: unflagged walls placed by rays, 268 coded; uniform flags set aside; flag vs geometry 3,534 of 4,564; eval/envelope-2026-11-20.md),
