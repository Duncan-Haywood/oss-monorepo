---
title: "Curved IFC volumes to 0.01% without a finer mesh: add each triangle's sag back"
seo_title: "Accurate IFC brep volumes on curved faces, no finer mesh"
date: 2026-11-23
tags: [ifc, bim, quantity-takeoff, geometry, tessellation]
description: "A mesh of a curved face sits inside it, so its volume comes up light. One term per triangle puts the curve back: four IFC breps went from 0.3% to 0.01% off."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads a
model's curved solids (B-spline and revolved faces) by cutting each face into
flat triangles and adding up the volume they enclose. Flat triangles drawn
between points on a convex curved face sit just inside it, so the total comes
out a little light. On two public models checked against IfcOpenShell, five
solids were 0.17% to 0.29% light for no other reason.

## Finer meshing works, slowly

Halving the mesher's tolerance halved the shortfall: 0.29% at the shipped
setting, 0.14% at half, 0.07% at a quarter. That is the textbook behaviour of
an inscribed mesh, and it means a finer mesh would get there, but at a quarter
of the tolerance the solids took three to four times as long, and at a tenth
one face ran past the triangle limit.

## Or add the curve back

Each triangle already knows the surface it came from. For each of its three
edges, take the surface point at the edge's middle and measure how far it
stands off the straight edge. Fit a quadratic patch through the triangle's
three corners and those three middle points, and the volume between that
patch and the flat triangle is exactly the three offsets, projected on the
triangle's normal, times a third of its area. (The six shape functions of a
quadratic triangle integrate to nothing at the corners and to a third of the
area at each edge middle.) Add that for every triangle, with the sign the
shell's orientation gives it, and the mesh's shortfall cancels to the next
order.

The mesh is unchanged, so areas, sections and the 3D viewer read the same
triangles; only the volume gains the term.

## What it measured

- Four of the five solids now agree with IfcOpenShell within 0.012%, at the
  shipped tolerance and at one five times coarser.
- On the FM_ARC_DigitalHub model, every one of the 1,309 advanced breps read
  agrees with IfcOpenShell's figure within 0.1%.
- A half cone frustum built in the tests agrees with its formula to one part in
  a million (it was 0.034% light), a quarter torus to 2e-5 (it was 0.12%
  light).

The fifth solid stays 0.117% light whatever the tolerance, so it is not the
mesh. Its edges are written slightly off the surface they bound, which may
explain it; that is the next question. The measurements and commands are in
[eval/curved-sag-2026-11-23.md](../../ventures/ifc-quantity-takeoff/eval/curved-sag-2026-11-23.md).

For an estimator, 0.3% of a curved precast element or a revolved column base is
small. But a takeoff tool that is off by a known, fixable amount on every curved
solid should not be, and this fix costs three surface lookups per triangle.

*IFC Quantity Takeoff is free and MIT licensed. Its figures are estimates from
the model as drawn, not a measured survey; check them before pricing.*
