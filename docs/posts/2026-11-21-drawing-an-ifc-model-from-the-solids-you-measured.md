---
title: "Drawing an IFC model from the solids you measured: a 3D view for the takeoff page"
seo_title: "A free 3D IFC viewer that shows which quantities to trust"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, webgl]
description: "IFC Quantity Takeoff now draws the model in 3D from the solids its volumes come from, coloured by whether stored quantities agree with the geometry."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) reads an IFC
model in the browser, builds a bill of quantities and recomputes every
element's volume from its geometry, so you know which stored figures to
trust. Until today it did all that in tables. Now it draws the model.

## What you can do with it

- **Colour by stored vs computed.** Green where the model's stored volumes
  and areas agree with the geometry, amber where they disagree for a reason
  the page can name (a GrossVolume with the openings already out, a unit
  slip, a wall split by level), red where nobody knows why.
- **Click a bill-of-quantities line** and the view isolates and frames its
  elements: "IfcBeam / HEA 200, 14 elements" stops being an abstraction.
- **Click a row of the checks** to fly to the element that disagrees.
- **Click an element** for its class, type, storey, material and the stored
  and computed figures side by side.

No plug-in and no library: about 250 lines of WebGL, and nothing leaves the
tab.

## The part that was not obvious

The takeoff does not store meshes. It stores each solid as a signed sum of
convex pieces, because that keeps volumes and openings exact: a concave
profile (an I-beam with root radii, an L-shaped slab) is fanned from one
corner into positive and negative triangles, and a window opening enters as
a negative piece. Draw the positive pieces and you get the fan's extra
triangles and no holes.

So the view draws only the boundary. For plain extrusions, the fan's
diagonals cancel in pairs and what is left is the profile's own outline,
swept. For everything else (clipped wall tops, openings cut), each face is
cut by the pieces overlapping it and kept only where the signed count of
pieces changes from inside to outside across it.

The check that this is right is simple: the triangles must enclose the
volume the takeoff computed. On 11 public models (14,994 elements, Revit,
ArchiCAD and Tekla exports among them) they do, within 0.5%, for 9,184 of
the 9,314 elements drawn from pieces. Most of the 130 that do not are
furniture on one school model, not traced yet; a few hundred very intricate
elements are drawn as their boxes so a big model stays responsive. The full
table is in
[eval/model-view-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/model-view-2026-11-21.md).

The first version took 33 seconds to draw the sample's one steel beam. The
extrusion shortcut brought it to 40 milliseconds; a 2,600-element Tekla
steel model now draws in about 8 seconds, piece by piece as it goes.

## Try it

Open the [takeoff page](../../ventures/ifc-quantity-takeoff/), press "Try
the sample model", and click the IfcBeam line. Or drop your own IFC: it is
read in your browser and never uploaded.

Quantities from a model are only as good as the model; the page is a
checking aid, not a measured survey or a cost estimate.
