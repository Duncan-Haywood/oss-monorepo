---
title: "ARCHICAD and Revit disagree on a clipped wall's height, and the IFC file says which one wrote it"
seo_title: "IFC Qto_ wall Height under a roof: ARCHICAD vs Revit"
date: 2026-11-22
tags: [ids-model-check, ventures]
description: "Which Qto_ Height ARCHICAD and Revit store for a wall a roof cuts, checked on 16 public walls, and how the free IDS checker now fills it."
---

The free [IDS checker](https://marisstella.app/ids-model-check/) can write
missing `Qto_WallBaseQuantities` values into a copy of an IFC model, measured
from each wall's own geometry
([brep walls and walls with no axis](2026-11-21-brep-walls-and-walls-with-no-axis.md)
was the last step). Until today it skipped one case on purpose: a wall that a
sloped roof or a slab cuts. Such a wall has two heights, and exporters
disagree about which one is "the" Height.

## Two exporters, two answers

Take a gable-end wall 3.5 m tall where the roof cuts its top down to 3.39 m.
On the public FZK-Haus model, ARCHICAD stores **3.387 m**: the cut wall's
highest point above its base. On the HHS Office construction model, Revit
stores the **extrusion depth**, the height of the wall before the roof took
anything off. The `Qto_` definition ("usually the extrusion depth") allows
both readings.

We checked every clipped wall in 15 public models that stores a Height:

| Authoring tool | Clipped walls with a stored Height | Matched by its own convention | Matched by the other one |
| --- | ---: | ---: | ---: |
| ARCHICAD | 11 | 11 | 2 |
| Revit | 5 | 5 | 0 |

So the convention follows the tool, and the tool is written in the file. Every
IFC element has an owner history that names the application that made it. The
filler now reads that name and writes the figure that application would have
written: the highest point for ARCHICAD, the extrusion depth for Revit. For any
other tool it still writes nothing and leaves the row in the to-fill table for
a person, because no public model shows what those tools store.

## A corner the first pass missed

Two of the eleven ARCHICAD walls first came out 2% low. Both are 2 m walls
mitred at each end under a hip roof. Their highest point, 2.0257 m, sits right
at a mitre's acute corner. The measurement drew vertical lines on the two faces
and the middle plane, nudged a hair inside each vertex along the wall, and
none of those lines falls inside that corner. Lines through every vertex,
nudged into each quadrant around it, now return 2.02569 m, which matches the
stored figure to five decimals. The nudge is deliberately not diagonal, since a
45-degree mitre face would contain a diagonal line exactly.

## What did not work: Revit's own constraints

Revit exports also carry each wall's constraints: base level, top level, the
offsets, and an "unconnected height". Adding those up looked like a way to
recover the uncut height of Revit walls exported as breps, which no longer
contain an extrusion. Against 358 stored Heights the constraints were right
where nothing unusual was going on (84 of 84 on one model). They were wrong on
every wall whose top is attached to a roof (0 of 67), and on walls that Revit
splits by storey on export: a 10.5 m wall from Level 1 to the roof comes out
as storey-high pieces, and each piece carries the whole wall's constraints.
So the constraints are not used. A Revit brep with a cut top still gets no
Height, and the method write-up gives the reason.

## Result

On the 15 models, 3,159 of 3,247 measured walls now get a Height, up from
3,133. On the Schultz Residence (Revit 2014) the fill now leaves 5 of 105 walls
failing instead of 14. The 5 left have no body that can be read. IfcTester
0.9.0 agrees on all 200 written values: each one failed before the fill and
passes after it, and nothing else started failing. Method and per-model
numbers:
[`eval/wall-cut-top-heights-2026-11-22.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/wall-cut-top-heights-2026-11-22.md).

If you have a Tekla, Vectorworks or Allplan export that stores a clipped
wall's `Qto_` Height, that one file would tell us that tool's convention.

*The checker gives estimates read from the model's geometry. It is not
professional advice; check quantities that go into a contract.*
