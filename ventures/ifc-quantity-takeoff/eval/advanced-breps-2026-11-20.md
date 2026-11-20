# Advanced breps read, and faceted shapes subtracted, 2026-11-20

**Question.** kleine_Wohnung_R22 (IFC4) writes 162 of its 425 elements, and
the openings of 37 more walls, as `IfcAdvancedBrep`. The tool reported all of
them as "not read". Most of those breps are not NURBS at all. Can they be read
exactly, and would openings and booleans then subtract from them?

**Data.** The 13 public models of
[stored-vs-computed-2026-11-19.md](stored-vs-computed-2026-11-19.md) (blob-less
sparse clones of `opensourceBIM/IFC-files` and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/`). The reference is IfcOpenShell 0.9.0 (pip), an
independent kernel (OpenCASCADE).

## What kleine_Wohnung's breps are made of

`node` survey of the 775 `IfcAdvancedBrep` in the file, by the surfaces their
faces lie on and the curves their edges run along:

| Faces on | Edges on | Breps |
|---|---|---|
| planes only | trimmed lines | 638 |
| planes and cylinders | lines and circles | 97 |
| planes and cylinders | lines, circles and B-spline curves | 32 |
| a surface of revolution (with planes, some cylinders) | lines and circles | 7 |
| a rational B-spline surface and planes | lines and circles | 1 |

So 767 of 775 (99%) are polyhedra or polyhedra with round parts, mostly the pieces
of windows and doors.

## How they are read (`geom.mjs`, `advancedShellLoops`)

- Every edge (`IfcEdgeCurve`) is sampled once, from its start vertex to its end
  vertex: a line as its two vertices, a circle or ellipse arc at 360 segments
  to the turn (the tool's arc rule), a B-spline (rational too) by de Boor at 16
  points to a knot span. Neighbouring faces use the same samples, so their
  shared edges match point for point.
- A face on a plane is its edge loops: a polygon, with any inner bounds.
- A face on a cylinder is cut into triangles in the surface's (angle, height)
  coordinates, using only its boundary's points. The triangles must join points
  of nearly the same angle, because each is a chord of the cylinder. A loop
  that never doubles back in angle is split at its least and greatest angle and
  its two chains are walked together by angle. A face between two full circles
  is a band, and its two rings are walked the same way.
- The faces then go through the faceted path: turned to agree across shared
  edges, volume by the divergence theorem, sections by `shellSection`.
- Faces on any other surface leave the brep "not read: advanced face on ...".

## Two faults the breps exposed in the faceted path

1. **A face with a hole was turned one loop at a time.** An inner bound shares
   its edges with the hole's walls, not with its outer bound. So in a stepped
   shell (a niche and a through-hole joined by an annular face) or a box with
   a hole through a face, the faces fall into two pieces. Turned loop by loop,
   the pieces could come out against each other. kleine_Wohnung's first window
   opening came out 0.049 m3 that way (1.748 − 1.699) instead of 3.448. Loops
   of one face now turn together, with every inner bound set to run against its
   outer bound by their Newell normals. This applies to faceted breps and to
   `IfcIndexedPolygonalFaceWithVoids` as well.
2. **A shell in several pieces was turned from one piece's first face.** Each
   piece (lump) is now turned outward by itself. When pieces' bounding boxes
   overlap, the reading carries the note "a shell in pieces that may overlap:
   any overlap is counted once for each piece". An exporter that writes three
   overlapping glazing plates as one shell gets their sum, not their union, and
   the note says so.

## Faceted shapes subtracted (`geom.mjs`, `asTerms`)

An opening, a boolean's second operand or a body that is faceted used to stop
the net volume ("faceted opening", "opening in a faceted body", "difference
with a faceted solid"). A closed shell is now converted when it is needed:
- A convex shell becomes one polyhedron.
- Any other closed shell becomes a signed sum of tetrahedra: every face is
  fanned into triangles, and each triangle is coned to the shell's centre of
  vertices. The cones' signed indicator functions add up to the shell's, so
  intersections stay exact, just as the fanned triangles of a concave profile
  do.
- A shell of over 4,000 tetrahedra is not converted, and the old reason stays.

The gross body keeps its faceted form, so the area rules for faceted bodies
are unchanged.

## Results

**Stored quantities, 13 models** (`node eval/stored-vs-computed.mjs`, output in
[stored-vs-computed-2026-11-20-breps.txt](stored-vs-computed-2026-11-20-breps.txt);
`node eval/areas-vs-stored.mjs` on the 8 that store areas,
[areas-vs-stored-2026-11-20-breps.txt](areas-vs-stored-2026-11-20-breps.txt)).
Every pair that agreed before still agrees. The changes:

| Model | Before | After |
|---|---|---|
| kleine_Wohnung | 263 volumes, 162 not read, 37 net not computed | 413 volumes, 12 not read (surfaces of revolution), 0 net not computed |
| kleine_Wohnung NetVolume | 226 pairs, 226 agree | 265 pairs, 265 agree |
| kleine_Wohnung NetSideArea | 173 pairs, 173 agree | 210 pairs, 204 agree (2 gross-as-net, 4 on-a-face) |
| S_Office | 2,896 volumes, 511 not read (220 "difference with a faceted solid") | 3,105 volumes, 302 not read (6 such, 5 over 20,000 pieces) |
| skolebygg | 4 net not computed (opening in a faceted body) | 0 |
| duplex | 8 net not computed (opening in a faceted body) | 0 |

The 39 new NetVolume pairs all agree with the exporter's stored NetVolume
(within 2%), so the advanced-brep openings and the signed tetrahedra are checked
against an independent figure. One kleine_Wohnung wall moved from "unexplained"
to "net-as-gross": its net could now be computed, and that net is what the
exporter stored as gross.

**Each brep against IfcOpenShell, kleine_Wohnung**
(`python3 eval/ifcopenshell-volumes.py model.ifc breps.json --breps`, then
`node eval/breps-vs-ifcopenshell.mjs model.ifc breps.json`, output in
[breps-vs-ifcopenshell-2026-11-20.txt](breps-vs-ifcopenshell-2026-11-20.txt)):

| Faces on | Breps | Read | Agree within 0.1% |
|---|---|---|---|
| planes | 638 | 638 | 601 |
| planes and cylinders | 129 | 129 | 102 |
| other surfaces | 8 | 0 | - |

None of the 64 disagreements is unexplained:
- **35: IfcOpenShell's volume is larger than the brep's bounding box.** No solid
  can be, so its figure is the wrong one; ours lies inside the box. Example:
  brep #10721 (a small fitting with round parts) has a 1.87e-4 m3 box. This tool gives 4.96e-5,
  IfcOpenShell 4.81e-4.
- **27: overlapping pieces.** Shells whose pieces overlap; the reading's note
  says the overlap is counted once per piece.
- **2: not closed.** Pieces touching along an edge (an edge used by four faces);
  the volume comes from the faces as written, with no section.

The round parts are checked by hand too. A 40 mm rosette with a keyhole,
10 mm thick (#19235), is 1.0381e-5 m3 worked out as the disc less a 320° sector, a
triangle, a slot and a half-circle. This tool gives 1.038e-5. IfcOpenShell gives
1.027e-5 at its default tessellation (1% light) and agrees when run finer
(0.05 mm, 0.02 rad), which is why the reference uses that setting. Before the
chains were walked by angle, ear clipping fanned each half cylinder from one
corner: 2.4 times its area, and the rosette came out 6.7e-6, 35% light.

**Each element against IfcOpenShell, kleine_Wohnung** (default tessellation, 1%;
[elements-vs-ifcopenshell-2026-11-20.txt](elements-vs-ifcopenshell-2026-11-20.txt)):
all 226 elements with no advanced brep agree gross and net. All 37 walls whose
openings are advanced breps agree gross and net. Of the 150 elements whose body
holds advanced breps, 68 agree. The other 82 are windows, doors and fittings
whose breps include the overlapping and over-the-box cases above (IfcOpenShell
gives one window 41 m3).

**duplex against IfcOpenShell**: the 8 furnishings whose net volume is newly
computed agree net 8 of 8.

SOFFICE_RESULT

## Speed

kleine_Wohnung reads in 2.9 s, up from 0.3 s, because it now reads 150 more
elements and samples every round edge at 360 points to the turn. Two changes
got it there from 6.6 s: shells are read once even when a mapped item repeats
them, and points are keyed once per object when faces are turned. S_Office
went from 2.1 s to 13.2 s, because 209 more elements are now read through
signed tetrahedra.

## What is left

- 8 kleine_Wohnung breps with faces on a surface of revolution or a NURBS
  surface (12 elements).
- Overlapping pieces are summed, not unioned. A union needs a polyhedral
  boolean, which would cost 4,000 terms or more per window.
- S_Office's 5 bodies over 20,000 pieces, and 6 differences whose faceted
  operand is not closed.
