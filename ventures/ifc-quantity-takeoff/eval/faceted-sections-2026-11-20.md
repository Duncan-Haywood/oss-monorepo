# Areas cut from faceted bodies, 8 public IFC models, 2026-11-20

**Question.** The area check of 2026-11-19
([areas-vs-stored-2026-11-19.md](areas-vs-stored-2026-11-19.md)) cut areas
only from bodies built of extrusions and clips. Faceted bodies (IfcFacetedBrep,
closed-shell surface models, triangulated and polygonal face sets) were
skipped: 2,051 elements on the same eight models stored an area of a checked
name and got no computed one, 1,544 of them in schependomlaan. Many exporters
write walls, slabs and coverings that way (ArchiCAD's, Revit's in-place
families, any model passed through a mesh converter). Can those be cut too,
and what do their stored areas look like?

**Data.** The eight models of the 2026-11-19 check, from the same sparse clones
(`opensourceBIM/IFC-files` at `cb96c50`; `ThatOpen/engine_web-ifc` at
`5ba2467`, `tests/ifcfiles/public/`). Volumes also on the five other models of
the volume check.

## Method

**Keeping the shells.** A faceted item now keeps its faces (each an outer
loop plus inner loops) as well as its volume, through placements, mapped items
and mirrors. A clip or opening that reaches a shell is still not taken from
it; such a body, and one with mesh volume no shell accounts for (swept disks,
revolved areas, CSG primitives), still has no section.

**Orienting the shells.** A shell's faces are turned so every shared edge is
run in opposite directions by its two faces (a walk over the faces from the
first), then the whole shell is turned outward if it encloses a negative
volume. An edge used by one face or by more than two, or a shell no turning
makes consistent, marks the shell not closed: its volume is kept as before
and it has no section. (`orientShell` in `geom.mjs`.)

**Cutting a shell.** Each face loop that crosses the plane does so along a
line. The loop's crossings, sorted along that line, pair up into the stretches
inside the loop (a simple polygon alternates in and out). Each stretch is a
piece of the section's boundary, run in the direction n x f (n the plane's
normal, f the loop's own normal), which is counter-clockwise seen from +n when
the face points out. Green's theorem then sums the area from the pieces
without joining them into loops; a hole runs the other way and takes its
stretches back out. A vertex on the plane counts as below it, so crossings
always pair. (`shellSection` in `geom.mjs`.) The planes are the ones the
extrusion check uses (a wall's middle plane, its base, a slab's or covering's
mid-thickness); a faceted body has no extrusion direction, so a slab or
covering is cut normal to its thinnest face direction, and a member gets no
CrossSectionArea.

**Independent check.** `node eval/faceted-section-check.mjs <files> --per-file 300 --grid 200`
(output in `faceted-section-check-2026-11-20.txt`) samples a 200 x 200 grid on
each cut plane and counts a point inside when a ray from it crosses the body's
faces an odd number of times (point-in-polygon on each face, holes included).
It shares no code with the section. 548 sections on 6 models (every faceted
wall, slab and covering on five of them, 300 spread over schependomlaan's
1,850): median gap 0.002%, one outside the tolerance (2% or four grid cells of
perimeter). By hand:

- schependomlaan #728311, a zinc flashing: the cut crosses its 1 mm leg (1 x
  2,531 mm = 2,531 mm2, our figure); the grid's cell is 2 mm, so the sampler
  misses it.
- An earlier run had two more. One was the sampler's (a 1e-9 bounding-box
  tolerance too tight for a model in millimetres; #101093's bottom is a
  trapezoid of 6,950 mm2 worked by hand, ours 6,914 on the unrounded points,
  sampled 3,300). The other, #875825, is two shells that share a face plane,
  where ray parity double-counts; the shell the plane cuts is 999 x 864 mm,
  as computed.

The tests (`engine.test.mjs`) cut an L-shaped brep and a square tube (faces
with holes) against the arithmetic, and the same L with three faces reversed.

## Result

`node eval/areas-vs-stored.mjs <files> --json eval/areas-vs-stored-2026-11-20.json`
(output in `areas-vs-stored-2026-11-20.txt`).

| | 2026-11-19 | 2026-11-20 |
|---|---:|---:|
| Elements storing a checked area, not cut | 2,051 | **6** |
| Pairs compared | 7,883 | **11,977** |
| Agree within 2% | 6,509 | **8,669** |
| Unexplained | 274 | **271** |

The 4,094 new pairs are schependomlaan's (4,052: 645 walls x 4 wall
quantities, 166 slabs and 591 coverings x gross and net) and C20's (42).
2,160 of them agree. Disagreements rose by 1,934 while the unexplained ones
fell by 3: the new causes also name 53 of skolebygg's 66 unexplained walls
(50 centre-line, 3 other-width) and Mini Project's 4 Tekla consoles
(plan-of-upright), and 54 of the new schependomlaan pairs stay unexplained
(90 there, was 36). Four causes are new; each was read by hand on several elements before it was
written as a rule (`explainAreas` in `qto.mjs`):

| Cause | Pairs | What it is | BoQ uses |
|---|---:|---|---|
| plan-of-upright | 742 | An upright covering (façade insulation `gevelisolatie`, cladding) stores its horizontal section as GrossArea and NetArea: 0.303 x 0.115 m = 0.0349 m2 on #32776, whose face is 0.303 x 3.435 = 1.041 m2 (volume 0.1197 m3 / stored thickness 0.115 m agrees with the face) | computed |
| centre-line | 612 | A wall's stored footprint is its stored centre-line Length x Width (512) or its side area Length x Height (100), while its ends are angled: #13529 stores 0.5778 x 0.1 = 0.0578 m2, while volume / height (0.0329 / 0.51) and the section both give 0.0645 | stored (a nominal figure some methods of measurement use) |
| zero | 96 | Stored 0 while the geometry has an area (window sills `waterslag`, schependomlaan) | computed |
| other-width | 81 | A wall shorter than it is thick or with skewed ends: its thinnest horizontal direction is not the width the tool measured across; the stored side is stored volume / stored width | stored |

Existing causes also grew: on-a-face 55 to 353 (now also a sloped or tapered
slab's top or bottom face, 296 slab and covering pairs, 12 of them C20's:
schependomlaan's
`dak dakkapel` roofs store 1.0464 m2, their top face, against 0.9976 at mid-
thickness) and matches-stored-volume 31 to 139.

C20's 25 gross and 29 net side areas that the 2026-11-19 report left
unexplained ("2-4% over", wall #31190 storing 17.35 m x 2.7 m) stay
unexplained: #31190 stores Length 18 and Height 2.7, whose product is the
geometry's 48.6 m2, and none of its stored lengths is 17.35 m, so the
centre-line test does not fire.

**Volumes.** `node eval/stored-vs-computed.mjs <13 files> --json eval/stored-vs-computed-2026-11-20.json`
(`stored-vs-computed-2026-11-20.txt`). Orienting the shells changed one
thing: the 58 HHS architect members (Revit surface models) that the volume
check had as unexplained, computed 39-43% over the stored GrossVolume, now
agree; some of their faces were written reversed and the divergence theorem
counted them with the wrong sign. GrossVolume agrees for 4,863 of 5,495 (was
4,805); NetVolume is unchanged at 6,133 of 6,366. Nothing else moved on any of
the 13 models. On the eight area models 349 faceted elements had at least one
face turned.

## What this does not show

Eight models, one of them (schependomlaan, ArchiCAD) carrying 4,052 of the
4,094 new pairs; centre-line and plan-of-upright are named mostly from that
exporter's habits (562 and 738 of their pairs; the rest skolebygg's Revit walls
and Mini Project's Tekla consoles). The plane a faceted slab or covering is cut on is its
thinnest face direction, which for a sloped roof piece or a folded flashing is
our choice, not the file's. Openings are still not taken out of faceted
bodies, so a faceted element with openings has a gross area and no net one.
241 faceted elements across the eight models have a shell that is not closed
(or no shell at all) and stay uncut. 271 disagreements remain unexplained, 113
of them skolebygg's mullion cross-sections from the earlier report.
