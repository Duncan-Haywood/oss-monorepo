# Faceted shells: reversed faces turned back, and why their stored areas miss, 2026-11-20

Follows [areas-vs-stored-2026-11-20.md](areas-vs-stored-2026-11-20.md), which
cut faceted bodies through their faces and found 2,915 of 4,251 new pairs
agreeing, with 1,499 disagreements unexplained across the eight models (1,051
of the 1,225 new ones on pieces storing under 0.6 m2). Two questions: are the
cuts themselves right, checked by a method that shares no code with them, and
what are the stored figures that miss?

**Data.** The same eight models at the same commits (`opensourceBIM/IFC-files`
`cb96c50`; `ThatOpen/engine_web-ifc` `5ba2467`, `tests/ifcfiles/public/`), plus
the five other models of the volume check.

## 1. Faces written the wrong way round

`shellSection` and the divergence-theorem volume both assume each face loop
runs counter-clockwise seen from outside. A file need not keep to that. The
shells are now turned before use (`orientLoops` and `orientShell` in `geom.mjs`):
across every shared edge the two loops must run it in opposite directions, so
a walk over the loops from the first turns any that disagree, and the whole
shell is turned if it then encloses a negative volume. An edge used by one
loop, or by more than two, or a shell no turning makes consistent, marks it not
closed: its volume is kept as before and it gets no section (one schependomlaan
element, 4 pairs).

On the eight models, 349 faceted elements had at least one loop turned. On the
volume check (`node eval/stored-vs-computed.mjs <13 files>`, output in
`stored-vs-computed-2026-11-20.txt`) one thing moved: the 58 HHS architect
members (Revit surface models) that the 2026-11-19 check had as unexplained,
computed 39-43% over the stored GrossVolume, now agree. Some of their faces
were written reversed and were counted with the wrong sign. GrossVolume agrees
for **4,863 of 5,495** (was 4,805); NetVolume is unchanged at 6,133 of 6,366;
nothing else moved on any of the 13 models.

## 2. An independent check of the cuts

`node eval/faceted-section-check.mjs <files> --per-file 300 --grid 200`
(output in `faceted-section-check-2026-11-20.txt`) samples a 200 x 200 grid on
each cut plane and counts a point inside when a ray from it crosses the
body's face loops an odd number of times (point-in-polygon per loop; a ray
through a hole crosses the outer and the inner loop and cancels). 548
sections (every faceted wall, slab and covering of five models and 300 of
schependomlaan's 1,850): median gap 0.002%, one outside the tolerance (2%, or
four grid cells of perimeter). By hand:

- #875825 (schependomlaan) is two shells sharing a face plane, where ray
  parity counts the shared plane twice; the shell the plane cuts is 999 x 864
  mm, as computed.
- An earlier run flagged #101093 because the sampler's bounding-box tolerance
  was absolute (1e-9) on a model in millimetres; its base is a trapezoid of
  6,950 mm2 worked from the rounded points (computed 6,914 on the exact ones).
- The largest gap inside the tolerance, #1014756, is a sliver under the grid's
  resolution.

## 3. What the stored areas that miss are

Each pattern was read on several elements before it became a rule
(`explainAreas` in `qto.mjs`). `node eval/areas-vs-stored.mjs <files> --json eval/areas-vs-stored-2026-11-20-causes.json`
(output in `areas-vs-stored-2026-11-20-causes.txt`):

| | before | after |
|---|---:|---:|
| Pairs | 12,134 | 12,130 |
| Agree | 9,424 | 9,420 |
| Unexplained | 1,499 | **358** |

| Cause | Pairs | What it is | BoQ uses |
|---|---:|---|---|
| centre-line (new) | 612 | A wall's stored footprint is its stored Length x Width (512 pairs) or its side area Length x Height (100), while its ends are angled or mitred. schependomlaan #13529 stores 0.5778 x 0.1 = 0.0578 m2; its volume / height (0.0329 / 0.51) and its section both give 0.0645. 562 in schependomlaan (ArchiCAD), 50 in skolebygg (Revit) | stored: a nominal figure some methods of measurement use |
| on-a-face (now slabs too) | 57 to 409 | A tapered or sloped slab's or covering's stored area is its top or bottom face, not mid-thickness: schependomlaan's `dak dakkapel` roofs store 1.0464 m2 (top face) against 0.9976 at mid-thickness | stored |
| zero (new) | 96 | Stored 0 with an area in the geometry (schependomlaan's window sills, `waterslag`) | computed |
| other-width (new) | 81 | A wall shorter than it is thick, or with skewed ends, whose thinnest horizontal direction is not the width the tool measured across: the stored side is stored volume / stored width | stored |

The four lost pairs are the element whose shell is not closed (section 1).

## What this does not show

Eight models, one of them (schependomlaan) carrying most of the named pairs;
centre-line and on-a-face on slabs are an exporter's habits named from few
exporters. 358 disagreements stay unexplained: 188 cross-sections (111 of them
skolebygg's mullions from the first report), C20's 54 side areas (wall #31190
stores Length 18 and Height 2.7, whose product is the geometry's 48.6 m2, yet
its GrossSideArea is 46.845 = 17.35 x 2.7, and no stored length is 17.35), and
small schependomlaan pieces. Openings are still not taken out of faceted bodies.
