# Stored areas against the geometry, 8 public IFC models, 2026-11-19

**Question.** The volume check
([stored-vs-computed-2026-11-19.md](stored-vs-computed-2026-11-19.md)) found
one stored GrossVolume in eight wrong. Areas are what most trades price
(plaster, paint, formwork, cladding, screed), so do the stored areas hold up
any better, and when they don't, why?

**Data.** The same public models as the volume check (blob-less sparse clones
of `opensourceBIM/IFC-files` at `cb96c50` and `ThatOpen/engine_web-ifc` at
`5ba2467`, `tests/ifcfiles/public/`), the eight that store areas: HHS Office
construction and architect (Revit), AC20-FZK-Haus and C20-Institute-Var-2
(ArchiCAD), kleine_Wohnung_R22, Mini Project (Tekla), schependomlaan,
ARK_NUS_skolebygg.

**Method.** `node eval/areas-vs-stored.mjs <files> --json eval/areas-vs-stored-2026-11-19.json`
(output in `areas-vs-stored-2026-11-19.txt`). Each area is a section of the
element's body by a plane, read off the quantity-set definitions:

| Stored quantity | Classes | Plane |
|---|---|---|
| GrossSideArea, NetSideArea | walls | the wall's middle plane, normal to its width ("as viewed by an elevation view of the middle plane of the wall") |
| GrossFootprintArea, NetFootprintArea | walls | horizontal, at the wall's base |
| GrossArea, NetArea | slabs, plates, coverings, roofs | normal to the extrusion, through mid-thickness ("the area of the extruded area geometry") |
| CrossSectionArea | columns, beams, members, piles | normal to the extrusion, at mid-length |

Gross cuts the body; net cuts the body less its `IfcRelVoidsElement`
openings. The width direction of a wall is the horizontal face normal along
which the body is thinnest. The section of a signed sum of convex polyhedra is
the signed sum of the convex polygons each one cuts (`sectionArea` in
`geom.mjs`), so an area is exact in the same way a volume is. Faceted bodies
have no polyhedral pieces to cut and are skipped (2,051 faceted elements
store a quantity of one of these names, 1,544 of them in schependomlaan;
the count includes windows and doors, whose areas are not checked here).

A pair agrees within 2%. Each disagreement is given the first cause that
explains it (`explainAreas` in `qto.mjs`, the code the page runs):

| Cause | Test |
|---|---|
| split / repeated | the same stored value on several elements with one Tag and class; their computed areas sum to it (split) or it is at least 1.5 times the largest (repeated) |
| unit-slip | stored = computed x 10^k (k not 0) or x 10.7639 or / 10.7639 (m2 to ft2), within 0.5% |
| net-as-gross | a stored gross area equals the computed net, on an element with openings |
| gross-as-net | a stored net area equals the computed gross, on an element with openings |
| on-a-face | a wall's stored side area equals the section on one of its faces, not its middle plane |
| scales-with-length | a CrossSectionArea at least 5 times the section, equal to the element's stored Length times one constant shared by at least 3 elements and half of its type |
| matches-stored-volume | stored side area x the wall's width equals the stored volume |
| unexplained | none of these |

## Result

| Quantity | Agree / pairs | Disagreements by cause |
|---|---:|---|
| GrossFootprintArea | **1,667 / 1,667** | none |
| CrossSectionArea | 1,928 / 2,599 | scales-with-length 558, unexplained 113 |
| GrossSideArea | 1,293 / 1,815 | net-as-gross 325, on-a-face 39, matches-stored-volume 31, split 22, repeated 2, unexplained 103 |
| NetSideArea | 531 / 589 | on-a-face 16, unexplained 42 |
| NetFootprintArea | 334 / 416 | gross-as-net 82 |
| GrossArea | 414 / 444 | unit-slip 24, unexplained 6 |
| NetArea | 342 / 353 | unit-slip 1, unexplained 10 |
| **All** | **6,509 / 7,883 (82.6%)** | 1,100 named, 274 unexplained |

Where they agree, they agree to rounding: the median relative difference of
agreeing pairs is between 0 and 2e-15 on seven models, and 1.3e-4 on HHS
construction, whose stored areas are rounded. By model: Revit HHS architect
members 1,392 / 1,392 and construction columns 257 / 257; ArchiCAD slabs 18 /
18; Tekla members 228 / 228; schependomlaan slabs 260 / 260.

In 607 disagreements (split, repeated, unit-slip, scales-with-length) the
stored figure is the wrong one, and the bill of quantities sums the computed
area instead.

## What the causes look like

- **Mullion "cross-sections" that are face areas (558, skolebygg, Revit).**
  A 50 x 120 curtain-wall mullion type stores CrossSectionArea = Length x
  2.97 m on every mullion of that type (6.831 m2 for a 2.3 m mullion, 19.42 m2
  for 6.54 m), while its geometry is a 207 x 50 mm rectangle (0.01035 m2). A
  takeoff that multiplies a section by a length would be off by a factor of
  several hundred to a few thousand.
- **Net written as gross (325).** The same exporters that write net volume
  under GrossVolume (skolebygg 254, HHS architect 33, kleine_Wohnung 32) do it
  for GrossSideArea too.
- **Doors left in the net footprint (82).** ArchiCAD (FZK 4, C20 24) and
  schependomlaan (54) store NetFootprintArea equal to the gross: openings that
  reach the floor are not taken out of the plan. Cutting the footprint at the
  wall's base, where doors cut it and windows do not, is our reading of
  "footprint"; a tool that cuts at mid-height would take windows out as well
  (an earlier run of this script did, and matched 52 fewer footprints, gross
and net together).
- **Square-foot factor (23 slab areas).** kleine_Wohnung's three roof slabs
  store GrossArea = NetArea / 10.7639 (5.5632 against 59.8815) and GrossVolume
  divided by the same factor; skolebygg's 20 roof slabs store GrossArea =
  geometry / 10.7639 (44.493 against 478.919 m2). A m2-to-ft2 conversion
  applied the wrong way, under a square-metre unit. The volume check had these
  three kleine_Wohnung roofs as unexplained; it now names them too.
- **Measured on a face (55).** ArchiCAD and Revit walls whose stored side area
  equals the section on one face of the wall: at an L-corner the two faces
  differ in length by about the wall's thickness, and the exporter measured on
  one of them (which one was not checked).
- **Agrees with an equally wrong stored volume (31).** HHS construction #656
  stores GrossSideArea 85.94 m2 and GrossVolume 16.94 m3 (85.94 x 0.2 = 17.2),
  while its body is 8.30 x 3.30 m (27.7 m2, 5.55 m3): the quantity set is
  self-consistent and describes another wall.

**Unexplained (274), by group:**

- skolebygg: 111 mullions whose stored CrossSectionArea is neither the section
  nor one length ratio of their type; 66 walls.
- C20 (ArchiCAD): 25 gross and 29 net side areas 2-4% over the stored one.
  Wall #31190 is 18 m long, 2.7 m high: the geometry, and ArchiCAD's own
  "Brutto-Wandoberflächenbereich" on both faces, give 48.6 m2; GrossSideArea
  says 46.845 (17.35 m x 2.7). Two columns store CrossSectionArea 1.2566 m2 =
  twice their perimeter, while ArchiCAD's own "Fläche der Stütze" agrees with
  the geometry (0.0314 m2).
- schependomlaan: 12 slivers (side areas under 0.6 m2) and 6 coverings.
- Mini Project: 4 Tekla consoles (NetArea 0.0925 against 0.0531).

## What this does not show

Eight models, the same small sample as the volume check. The plane each
quantity is cut on is our reading of the IFC definitions; a tool that reads
"footprint" or "side" another way is reported as disagreeing, with the cause
named where it is one of the listed ones. Curved walls are cut on a flat
plane (their thinnest flat direction), not along their developed length, and
no model here was checked for them. Faceted bodies are not cut at all.
