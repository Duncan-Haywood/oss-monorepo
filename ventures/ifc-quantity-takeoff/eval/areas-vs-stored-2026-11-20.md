# Areas cut from faceted bodies, 8 public IFC models, 2026-11-20

**Question.** The first area check
([areas-vs-stored-2026-11-19.md](areas-vs-stored-2026-11-19.md)) skipped
every element whose body is a mesh (IfcFacetedBrep, closed-shell surface
models, IfcPolygonalFaceSet, IfcTriangulatedFaceSet): 2,051 elements storing an
area, 1,544 of them in schependomlaan, where ArchiCAD exported most walls,
slabs and coverings as breps. Can those be cut by a plane too, and do their
stored areas hold up?

**Data.** The same eight models, at the same commits (`opensourceBIM/IFC-files`
`cb96c50`; `ThatOpen/engine_web-ifc` `5ba2467`, `tests/ifcfiles/public/`).

**Method.** `node eval/areas-vs-stored.mjs <files> --json eval/areas-vs-stored-2026-11-20.json`
(output in `areas-vs-stored-2026-11-20.txt`). The planes are the ones in the
2026-11-19 check. What is new is how a mesh is cut (`shellSection` in
`geom.mjs`):

- A mesh keeps its faces (`shells`: closed shells of face loops, each with the
  sign that makes its volume count positive, or negative for a void).
- Each face is fanned into signed triangles. The part of a triangle on the
  lower side of the plane has one edge lying in the plane, from where the
  boundary leaves the half-space (X) to where it comes back (Y). Over a closed
  shell these edges join up into the section's boundary, traversed Y to X, so
  the section's area is the sum of n.(Y x X) / 2. Faces need not be convex;
  the section may have several pieces and holes; each piece's turn gives its
  sign. No polygon is ever assembled.
- A mesh whose volume came partly from shapes with no faces here (a swept
  disk, a revolved area, a CSG primitive), or that had a clip or an opening
  applied that its faces did not take part in, still gets no section.
- A faceted member has no extrusion axis, so its cross-section is cut normal
  to the face normal along which it is longest (an end face's).
- A faceted slab, plate or roof is cut across its thinnest direction, as an
  unextruded one was before. A faceted **covering** is cut normal to the
  element's up direction. This is a choice fitted on one model: on
  schependomlaan's 728 faceted coverings, the up cut agrees for 533, the
  thinnest-direction cut for 196 (ArchiCAD stores the area of the outline it
  extruded upward, so a 74 mm insulation board standing 0.37 m high stores
  its plan, 1.29 m x 0.074 m = 0.095 m2, not its face). On the same model's
  faceted slabs the thinnest cut agrees for 213 of 275 and the up cut for 200
  (the misses are sloped roof slabs), so slabs keep the thinnest cut.

**Checks by hand** (`engine.test.mjs`): an L-shaped prism written as a mesh
with two concave L faces (section 4 at any height, 4 and 2 across each leg,
2 x 2 x sqrt 2 on the diagonal), the same faces reversed (sign flips), a void
inside it (0.25 out where the plane crosses it, nothing where it does not),
two disjoint shells (they add), a mirror (unchanged), and the sample office's
floor slab rewritten as an IfcFacetedBrep and as an IfcTriangulatedFaceSet: both
give the hand-worked 20 m2 plan and agree with the stored GrossArea. Every
stored volume on all 13 corpus models is unchanged (the volume script's output
is identical line for line apart from timings).

## Result

| Quantity | Agree / pairs, 2026-11-19 | Agree / pairs, now | New pairs (faceted bodies) |
|---|---:|---:|---:|
| CrossSectionArea | 1,928 / 2,599 | 2,005 / 2,752 | 77 / 153 |
| GrossSideArea | 1,293 / 1,815 | 1,773 / 2,461 | 480 / 646 |
| GrossFootprintArea | 1,667 / 1,667 | 2,057 / 2,313 | 390 / 646 |
| NetFootprintArea | 334 / 416 | 724 / 1,062 | 390 / 646 |
| NetSideArea | 531 / 589 | 1,099 / 1,235 | 568 / 646 |
| GrossArea | 414 / 444 | 915 / 1,201 | 501 / 757 |
| NetArea | 342 / 353 | 851 / 1,110 | 509 / 757 |
| **All** | **6,509 / 7,883 (82.6%)** | **9,424 / 12,134 (77.7%)** | **2,915 / 4,251 (68.6%)** |

Elements storing an area that are still not cut: 5 (Mini Project), down from
2,051. Where a faceted pair agrees, it agrees to rounding (schependomlaan's
median relative difference of agreeing pairs is 4.3e-13, against 1.6e-16 when
only its extrusions were cut: the mesh's vertices are written to a few
decimals).

**Stored areas on faceted bodies disagree much more often** than on extruded
ones: 31% of the new pairs against 17% of the old. The disagreements are
mostly small pieces: of the 1,225 new unexplained pairs, 1,051 store under
0.6 m2. Weighted by stored area, 74.3% of the faceted pairs' area agrees;
pairs storing 0.6 m2 or more agree 1,023 of 1,305 times (78.4%).

Named causes on the new pairs (111): 98 schependomlaan walls whose stored
GrossSideArea times the wall's width equals the stored volume while the mesh
says otherwise (the quantity set describes a different body), 54 net
footprints with the doors left in (already counted on 2026-11-19 for the
extruded walls; here on the meshes), one unit slip.

**Unexplained (1,225), by group:**

- schependomlaan walls: 256 footprints and 67 side areas, every footprint under
  0.6 m2 (outer-leaf pieces "buitenblad" 124, party-wall pieces 56, dormer
  cheeks 19); median miss 19%. Small brick-leaf pieces whose stored footprint
  is the length times the width before the corners were mitred, by the look of
  #15893 (1.48 m long, stored as 1.43 m x 0.1 m); not tested.
- schependomlaan coverings: 188 gross and 188 net, nearly all under 0.6 m2
  (copings "afdekker" 91, sills "waterslag" 34, insulation 30). A coping 150 mm
  wide stores 130 mm x its length (#148443: 0.225 m2 cut, 0.195 stored); why
  was not traced.
- schependomlaan slabs: 62 gross and 54 net, 30 of them rafter-level roof
  slabs ("sporenkap") 1-8% off across the thinnest direction.
- HHS architect: 58 curtain-wall posts (6 x 15 with cover profile) whose
  stored CrossSectionArea is about 0.39 m times their length (0.66 m2 on a
  1.70 m post), a face area like skolebygg's mullions, but the posts store no
  Length, so the scales-with-length rule cannot name it.
- schependomlaan foundation beams: 17, 7% over on the strip footings.
- C20: 6 faceted slabs.

## What this does not show

The covering rule (cut normal to up) is fitted on one model, the only one here
with faceted coverings; another tool that writes a covering's face area would
read as disagreeing. Faceted bodies still have no openings subtracted: an
element with openings and a mesh body gets a gross area but no net one (schependomlaan's
faceted walls carry no opening elements, so their net pairs compare the
mesh's own section). A mesh clipped by a half-space is not cut.
Eight models, the same small sample as before.
