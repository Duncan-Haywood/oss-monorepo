---
title: "A slab's perimeter from the pieces a geometry kernel cut it into"
seo_title: "IFC slab Width and Perimeter measured from geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim, ifc]
description: "IDS Model Check now writes a slab's missing Qto_ Width and Perimeter from its body: 396 of 396 and 375 of 377 match the figures exporters stored."
---

An IDS file for a cost plan often asks every slab for two figures from
`Qto_SlabBaseQuantities`: `Width`, which the standard defines as the slab's
total thickness, and `Perimeter`, the outline of its profile. Formwork edges
and slab-edge details are priced per metre of that outline. Many exports
leave both out. Until today, [IDS Model Check](../../ventures/ids-model-check/)
could write a slab's area and volume from its geometry but sent these two to a
table for a person to fill in.

## The thickness was easy

The thickness is the body's depth along its extrusion. On eleven public
exports from Revit, ARCHICAD and Tekla, that figure matched the stored `Width`
on every extruded slab, 259 of 259. Faceted slabs (bodies stored as triangles
or polygons, with no extrusion) matched only 158 of 221 times. Tekla's grout
strips, profile `533*193`, store 0.533 m as `Width` on a body 0.193 m thick,
and ARCHICAD's sloped pieces store a vertical figure. So only extruded slabs
get a `Width`.

## The perimeter needed a small trick

The quantity takeoff engine underneath stores a body as a signed sum of convex
pieces. A Revit floor whose outline has 46 corners comes out as 43 pieces, 19
of them negative: pockets cut back out of a convex hull. Cutting each piece
through the middle of the slab gives 43 convex polygons. Add up all their
edges and every inner cut is counted, often twice, so the total is far longer
than the floor's real 261 m outline.

The fix is to give each edge a sign and add them up line by line. An edge is
+1 or -1 depending on which side its piece lies on and whether the piece is
positive or negative. Where two pieces share an edge, the two signs cancel.
Where a negative pocket's edge lies on a positive piece's edge, they cancel
too. What is left with a non-zero count is the outline. Collinear edges have
to be merged as intervals along their line, because two pieces often meet at
a T-junction where one edge is longer than the other. On that Revit floor the
result is 261.1427 m. The stored figure is 261.1427 m.

## Openings: the tools disagree

A slab with a stair opening has two candidate outlines: the outer edge alone,
or the outer edge plus the opening's edge. The exports do not agree:

- ARCHICAD adds the openings' edges: 7 of 7 slabs with openings.
- Revit leaves them out: 40 of 42.

So the fill reads which tool wrote the element and uses that tool's
convention. If the tool is neither, a slab with an opening cutting its outline
gets no perimeter. A guess would pass the IDS check and still be wrong.

## How close it gets

Against every figure the eleven exports stored
([the measurement](../../ventures/ids-model-check/eval/slab-width-perimeter-2026-11-22.md)):

- `Width`: 396 offered, 396 within 2%.
- `Perimeter`: 390 offered, 375 within 2%. Thirteen of the other fifteen are
  pieces of a split floor that each store the whole floor's figure (113.20 m
  and 33.14 m, both stored as 146.34 m). The last two are Revit floors that
  store the outline with openings, unlike the other 40. Leaving out the split
  pieces, that is 375 of 377.

Then I hid the stored figures and let the fill write them back. On eight
models it wrote 828 values. Every one passes the fill's own re-check, and
IfcOpenShell's IfcTester moves the same 828 slabs from fail to pass.

## Try it

On the [IDS Model Check page](../../ventures/ids-model-check/), check a model.
If the IDS asks for quantities the model lacks, tick *Measure missing Qto_
volumes, areas and lengths* under "Write the missing values into the model".
From the command line:

```
node cli.mjs --fill model.ifc spec.ids -o filled.ifc --from-geometry
```

Everything runs in your browser or on your machine, and the model is never
uploaded. The values are estimates read from the model's geometry. Check them
against your own figures before you price work on them.
