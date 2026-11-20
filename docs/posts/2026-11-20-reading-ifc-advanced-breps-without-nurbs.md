---
title: "Most IFC advanced breps are not NURBS: reading 767 of 775 exactly"
seo_title: "Most IFC advanced breps are not NURBS"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "99% of one model's IfcAdvancedBrep bodies were planes and cylinders. Reading them took a chord rule, a face-with-a-hole fix and signed tetrahedra."
---

Our [IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/) recomputes
every element's volume from its geometry and checks it against the quantities
the authoring tool stored. Until today it gave up on any body written as an
`IfcAdvancedBrep`, the IFC4 type for boundary representations with curved
surfaces. On kleine_Wohnung, a public model exported from Revit, that left 162 of 425
elements unread. It also blocked the net volume of 37 walls whose window
openings are advanced breps.

The name suggests NURBS, and NURBS is what we had assumed. A count of what the
775 breps in that file are made of says otherwise:

| Faces on | Breps |
|---|---|
| planes only (edges all straight lines) | 638 |
| planes and cylinders (edges on circles, some on B-spline curves) | 129 |
| a surface of revolution or a NURBS surface | 8 |

So 99% are polyhedra, some with round parts, mostly the pieces of windows and doors. The model came out of
Revit 2022 and passed through IfcOpenShell on the way, and one of them wrote
plain polyhedra in the most general brep IFC4 has.

## Planes and cylinders

Each edge is sampled once (an arc at 360 segments to the turn, a B-spline by de
Boor), so the two faces that share it share its points exactly. A planar face
is then just its edge loops. A cylindrical face has to be cut into triangles,
and here the obvious method failed. Ear clipping in the surface's (angle,
height) plane fans a half cylinder from one corner. Lifted back onto the
cylinder, each triangle is a chord, and the long ones cut straight through the
solid. That half cylinder came out at 2.4 times its true area, and a
40 mm rosette (a keyhole escutcheon) 35% light. The fix is to triangulate so that every triangle
joins points of nearly the same angle: split the boundary at its least and
greatest angle and walk the two chains together. The rosette is now
1.038e-5 m³, against 1.0381e-5 m³ worked out by hand.

## Two old faults the new shapes found

The window openings were the first test, and the first one came out
0.049 m³ instead of 3.45. It is a stepped opening: a deep niche joined to a
through-hole by a face that has a hole in it. That face's inner boundary shares
edges with the hole's walls, not with its own outer boundary. So the faces fall
into two groups that meet only through it. The code that turns faces to agree
with their neighbours treated each loop separately, and turned the two groups
against each other. The volume came out as the difference of the two boxes.
Faceted breps had the same weakness; nothing in the test models had hit it yet.
Now the loops of one face turn together, and each separate piece of a shell is
turned outward by itself.

The second fault: openings could not be subtracted from mesh shapes at all.
Subtraction works on convex pieces, and a mesh is not one. But any closed mesh
is a signed sum of tetrahedra. Fan each face into triangles and join each
triangle to a fixed point: the tetrahedra outside the solid cancel out, just as
the fanned triangles of a concave outline do. So a stepped opening, or a
boolean's faceted operand, can be intersected exactly.

## Checked against what

- **The model's own figures.** All 39 newly computed net volumes agree with the
  NetVolume the exporter stored. Wall net side areas went from 173 checked to
  210 checked, 204 of them agreeing. Nothing that agreed before stopped agreeing
  on any of the 13 test models.
- **Another kernel.** We compared each brep with IfcOpenShell. 703 of the 767
  now read agree within 0.1%, once IfcOpenShell is tessellated finely enough:
  at its default, round parts come out about 1% light. None of the other 64 is
  unexplained. In 35 of them IfcOpenShell's volume is larger than the shape's
  bounding box, which no solid can be. 27 are shells an exporter wrote as
  several overlapping pieces, such as three glazing plates in one shell. Those
  we sum, and the element says so. 2 are pieces that touch along an edge.
- **Elsewhere in the corpus.** The same subtraction unblocked 209 elements of
  another model (S_Office) and every remaining net volume on two more.

The 8 breps on revolved and NURBS surfaces are still reported as not read,
never guessed. The full write-up, with every count and the commands to rerun
it, is in
[eval/advanced-breps-2026-11-20.md](../../ventures/ifc-quantity-takeoff/eval/advanced-breps-2026-11-20.md).
