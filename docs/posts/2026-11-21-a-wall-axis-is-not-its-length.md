---
title: "A wall's axis is not its length: measuring Qto_ wall lengths for the IDS model fill"
seo_title: "Wall Length from an IFC Axis: why the curve is the wrong answer"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "ARCHICAD's wall axis runs along a face, so its length is off. Measured on the wall's middle plane, 465 of 492 stored lengths agree within 2%."
---

The free [IDS checker](https://marisstella.app/ids-model-check/) can write
missing values into a copy of an IFC model. Since this morning it could also
measure missing `Qto_` volumes and areas from each element's geometry. Wall
`Length` and `Height` still went to the to-fill table, because a wall's
length looked like it needed the wall's `Axis` representation. This run read
the axis. The obvious answer turned out to be wrong.

## The curve's length is the wrong number

In IFC, a wall usually carries a short polyline called its `Axis`. Taking that
polyline's length matches Revit exports, where the axis is the location line
and Revit stores that line's length. It fails on ARCHICAD. On the FZK-Haus
sample, one interior wall has a 4.59 m axis but a stored `Length` of 4.17 m.
ARCHICAD's own properties for that wall explain the gap: the faces are 4.05 m
and 4.29 m, and 4.17 m is their average, which ARCHICAD labels "length of the
wall in the axis". The `Axis` curve runs along the reference line, here one
face, out to that line's corner.

Taking the axis curve's length, 0 of FZK-Haus's 13 stored lengths came within
2%, and 39 of 121 on the C20 institute model.

## What the fill does instead

The axis now supplies only the **direction**. The length is measured on the
wall's body, along that direction, on the plane halfway through the wall's
thickness. It takes the level where the wall is longest, so a gable wall is
measured at its base. The body is read the way
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) holds
it: a signed sum of convex pieces, where a roof clip is a negative piece. So
"inside" along a line means wherever the signs add up above zero.

`Height` is the extrusion depth, which is what the `Qto_` definition calls
it. On a wall that a roof or slab clips, though, exporters disagree. Revit
stores the unclipped depth and ARCHICAD the clipped wall's tallest point. In
that case the fill writes neither and leaves the row in the table with a
reason.

## How close it comes

Five public models store both figures (three Revit exports, two ARCHICAD):

- **465 of 492 lengths within 2%.** Using the axis curve's length, 370 would be.
- Of the 27 misses, 19 are stored lengths that disagree with the same
  exporter's own side area divided by height. 4 more differ by half or all
  of the thickness of the wall they join, and 4 are unexplained.
- **476 of 476 heights the fill offers agree.** The 16 it holds back are the
  clipped walls, where either answer would be wrong for one of the two exporters.

Next, the fill was run with an IDS asking walls for `Length` and `Height` on
five models. It wrote 758 values, and every one reads back passing in this
checker and in IfcTester. No element that passed before fails after.

The method, the per-model numbers and what is still open (curved walls,
faceted-brep walls, walls with no axis) are in
`ventures/ids-model-check/eval/wall-axis-lengths-2026-11-21.md`. The tool
runs in a browser tab and uploads nothing. Its results are checks, not
professional advice.
