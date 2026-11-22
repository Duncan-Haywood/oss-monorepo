---
title: "When the reference kernel turns a face inside out: five curved IFC solids traced"
seo_title: "IFC takeoff: five curved solids traced to inside-out faces"
date: 2026-11-22
tags: [ifc-quantity-takeoff, construction, geometry, evaluation]
description: "A domed basin bottom now reads in our IFC takeoff, and five volume gaps against IfcOpenShell turned out to be its own faces facing inward."
---

[ifc-quantity-takeoff](../../ventures/ifc-quantity-takeoff/README.md) is a free, in-browser quantity takeoff for IFC building models. It recomputes every element's volume from the model's geometry, so an estimator can see which stored quantities to trust. We check its geometry against [IfcOpenShell](https://ifcopenshell.org/), an open-source geometry kernel built on OpenCASCADE, and against closed-form formulas where a shape has one. Two days ago five curved solids still disagreed with IfcOpenShell for no reason we could name, and one more could not be read at all. Today all six have a cause, and five of the six causes are on IfcOpenShell's side. The full working is in [eval/pole-faces-2026-11-22.md](../../ventures/ifc-quantity-takeoff/eval/pole-faces-2026-11-22.md).

## A basin bottom that looked like a band

The solid we could not read was #162827 in the public model `ISSUE_159_kleine_Wohnung_R22`, mapped onto six elements. It is a round basin about 30 cm across. It has a flat top, a short cylindrical side, a 2 mm fillet and a domed bottom. Each curved surface is written as two halves. Each half of the dome is bounded by half the rim and by two meridians that meet at the bottom, on the dome's axis.

To cut a curved face into triangles, the reader maps its boundary into the surface's own (angle, height) coordinates. On the axis the angle means nothing. The loop runs half a turn round the rim, down to the axis at angle 0, and back up at angle π. At the step past the axis, unwrapping the angle has to pick either +π or −π. `Math.round(0.5)` picked the one that made the loop wind a whole turn, so the face was refused as one that "goes round the whole surface". A test of a half cone had passed only because its loop ran the other way, so the rounding happened to fall the right side.

The fix finds the points where a parameter pinches (the axis, or the tip of a ruled face) before the winding test, not after it. If the loop then winds a whole turn, that turn goes on the step across the pole, where it costs nothing. A face that truly wraps round its surface, with no pole on its edge, is still refused. A new test builds a hemispherical bowl in two halves, run in both directions. With the fix removed, it fails in one of them.

## Three figures for one basin

| | Volume (m³) |
|---|---:|
| ifc-quantity-takeoff | 0.0020392 |
| Pappus's theorem on the exact profile | 0.0020402 |
| IfcOpenShell 0.9 | 0.0019012 |

Our figure is 0.05% under the formula. That is expected: flat triangles inscribed in a convex surface lie slightly inside it. IfcOpenShell is 6.8% under. Its mesh sits on the true surface wherever we cast a vertical ray through it, and every edge is shared by two triangles. Yet the 99,540 triangles of its fillet face inward. The signed volume then counts the fillet's share of the solid negative, so the total falls short. When every triangle is turned to agree with its neighbours, the same mesh encloses 0.0020395 m³.

## The other four

We ran the same check (`eval/ifcopenshell-orient.py`) on every curved solid still listed as unexplained:

| Solid | Ours | IfcOpenShell | Its triangles turned to agree |
|---|---:|---:|---:|
| kleine_Wohnung #207801 | 1.6549e-5 | 1.3904e-5 | 1.6560e-5 |
| FM_ARC_DigitalHub #121421 | 0.110598 | 0.105378 | 0.110598 |
| FM_ARC_DigitalHub #128967 | 2.2702e-4 | 2.8811e-4 | 2.2705e-4 |
| FM_ARC_DigitalHub #130735 | 1.3307e-5 | 2.1732e-5 | 1.3347e-5 |

Every one has between 1,393 and 2,520 directed edges that are not paired with their reverse. Once turned, every one agrees with our figure within 0.3%, and always on the light side, as inscribed meshes should be. The gaps ran in both directions, from 19% over to 39% under, because a face turned inward can subtract either a small or a large part of the solid.

## What it means for a takeoff

kleine_Wohnung now reads all 775 of its advanced-brep solids. The table above is also a warning for anyone who uses a single geometry kernel as ground truth. A disagreement between two kernels is a question, not an answer. Here a formula, a ray test and an edge count settled it.

Still open: a face that wraps round its surface with no pole on its edge, which needs a seam cut (none is left in these models). The reference script could also write the turned figure itself, so the comparison names this cause automatically. Both are in the venture's [NEXT.md](../../ventures/ifc-quantity-takeoff/NEXT.md).
