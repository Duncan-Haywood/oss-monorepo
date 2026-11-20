---
title: "Pipe bends and NURBS: reading curved IFC breps in a browser takeoff"
seo_title: "Curved IFC breps (NURBS, revolved faces) in a free takeoff"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff now measures breps on surfaces of revolution and NURBS. 24 of 27 read; twice, IfcOpenShell's figure failed a check by formula."
---

The free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
works out every element's volume from its own geometry, so it can tell you
which of the quantities stored in the model to trust. Until today one kind of
geometry stopped it: an `IfcAdvancedBrep` with a face on a curved surface
other than a cylinder. Those are the bends of pipes, the rounded ends of
handles, the twisted faces of fittings. Exporters write them as surfaces of
revolution and B-spline (NURBS) surfaces, and the tool reported them as "not
read" rather than guess.

Of the 28 public test models we swept for them (the `.ifc` files in web-ifc's public test set), two have them: a small IFC4 flat
(kleine_Wohnung, 8 such breps) and an office's architectural model
(FM_ARC_DigitalHub, 22, most of them MEP fittings).

## How it reads them now

Each curved face gets a parameter map, two numbers (u, v) to a point on the
surface and back. For a surface of revolution that is a formula. For a
B-spline it is de Boor's algorithm one way and Newton's method the other. The
face's boundary goes into (u, v), where it is a flat polygon. That polygon is
cut into triangles, which are halved until each edge's midpoint on the surface
sits within 0.02% of the face's size of the straight edge.

Two details mattered more than the maths:

- **The boundary is never touched.** The edges are sampled once and shared
  with the neighbouring faces, so a curved face must meet its plane or
  cylinder neighbours point for point. New points go inside the face, never
  on its edge, or the shell would no longer close.
- **Dense edges must not make a dense inside.** A pipe bend's circular edges
  have hundreds of sample points. Triangulated as they stand, one bend came
  out in 115,552 triangles. Setting the straight runs (in u, v) aside and
  fanning them back in at the end brought that to 4,798.

The first versions also kept halving without end, four different ways. One
of them is worth knowing if you write this sort of code: a cone's diagonal in
(u, v) is not a straight line on the cone, so a triangle there is twisted.

## Checking the volumes

IfcOpenShell (OpenCASCADE underneath) is the usual reference. Of the 24
curved breps now read, 13 land within 0.3% of it, and always a little light.
That is expected: the triangles sit just inside a convex surface.

Some of the rest are more interesting. One part is a ring whose cross-section
is a half disc. Its volume follows from Pappus's theorem and the radii in the
file: 0.004043 m³. Our figure is 0.0040357, 0.18% light. IfcOpenShell gives
0.02457, six times the solid. The same goes for a pipe bend. Its tube radius,
bend radius, angle and two straight runs give 3.517e-4 m³. We get 3.524e-4;
IfcOpenShell gives 1.325e-4, less than the bend on its own.

Four breps are still unexplained, between 5% and 39% apart from IfcOpenShell.
For three of them, counting random points inside our mesh agrees with our
volume, so the shells are closed and consistent. But that doesn't prove the
faces are on the right side of their bounds, so the write-up lists them as
open. Three breps are still reported as not read: a face that wraps all the
way round its surface, and two whose edges sit half a millimetre off the
surface they bound.

Everything, including the scripts and the IfcOpenShell comparison, is in
[the write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/curved-breps-2026-11-20.md).
The tool runs in your browser tab, and your model never leaves it.
