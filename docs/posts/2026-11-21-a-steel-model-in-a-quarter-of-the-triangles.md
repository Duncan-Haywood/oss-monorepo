---
title: "A steel model in a quarter of the triangles, with the same solids"
seo_title: "Fewer WebGL triangles for an IFC steel model: thin, keep the area"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, webgl]
description: "The IFC takeoff's 3D view drew a Tekla steel model in 1.82 million triangles. Thinned outlines scaled back to their area cut it to 416 thousand."
---

The 3D view in [IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/)
draws every element from the solid its volume was computed from. That way
the picture is a check on the numbers. The geometry code samples every arc at
360 points to the full turn, so areas and volumes come out within 5e-5 of the
true curve. The view used those same points, and on steel that costs a lot.
One rectangular hollow section with 2 mm corner radii was 2,912 triangles.
The public Tekla "Mini Project" model came to 1.82 million, 1.72 million of
them in beams.

## What changed

For an extruded profile (most steel members, most walls and slabs) the view
now draws a thinned outline. Each loop of more than 24 points is simplified
with Douglas-Peucker, to a tolerance of 0.05% of the loop's size. The thinned
loop is then scaled about its centroid back to its original area, the same way
the geometry code gives a sampled circle its area-preserving radius. The
sides are rebuilt from the thinned loops, so they still meet the end caps and
the solid stays closed. A unit circle's 360 points become 64.

The scaling step matters. The first version left it out and thinned none of
the model's 254 hollow sections. An inscribed polygon is about 0.1% small.
On a ring with a 1.4 mm wall round an 85 mm section, that is several per cent
of the ring's area, which a safety check rightly refused. Scaled back, the
ring keeps its area. The check now refuses only outlines whose edges would
cross, which happens when a wall is too thin for the tolerance.

## How it was checked

The view already had a check: for every element, compare the volume the drawn
triangles enclose with the volume the takeoff computed, within 0.5%. Here it
is on the same 11 public models as before:

| Model | Triangles before | After |
|---|---:|---:|
| Mini Project (Tekla steel) | 1,822,928 | 415,880 |
| HHS Office architect | 224,470 | 153,266 |
| schependomlaan | 254,498 | 225,166 |
| ARK_NUS school (56 MB) | 2,460,105 | 2,346,241 |
| All 11 | 6,687,278 | 5,065,830 |

The volume check gives the same answer as before: 9,310 of 9,312 elements
agree, and the two that miss are beams the change does not touch, off by the
same 0.51% and 0.53%. The quantities themselves never come from these meshes.

The viewer stores 63 bytes per triangle on the GPU, so Mini Project went from
about 115 MB of graphics memory to 26 MB. On a laptop with integrated
graphics that can decide whether the model opens at all.

## What it did not fix

Meshing time is unchanged, because it goes to members with cuts and copes,
which the general method draws and which keep their full arcs. Another
residential model stays at 1.46 million triangles: 136 of its elements are
faceted bodies, drawn as the exporter meshed them. Thinning a triangulated
face set is the next display job. The full write-up is in the venture's
[eval note](../../ventures/ifc-quantity-takeoff/eval/display-thinning-2026-11-21.md).

*The takeoff gives estimates from the model's geometry, not professional
quantity surveying advice. Check figures before you price work from them.*
