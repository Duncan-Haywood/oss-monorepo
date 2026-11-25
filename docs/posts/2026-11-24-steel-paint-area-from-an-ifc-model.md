---
title: "Steel paint area from an IFC model: a coating column, checked against section tables"
seo_title: "Steel paint and galvanising area from an IFC model, checked"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, bim, structural-steel, estimating, ventures]
description: "The free IFC takeoff now gives a coating area for every steel part, matching published section tables; 797 of 825 parts on 8 public models."
---

Painters, galvanisers and fire-protection applicators price structural steel
by the square metre of surface. A model knows that surface exactly, but most
takeoff tools don't report it, and the figure an authoring tool stores is not
always the one you'd price. The free
[IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/) now has
a **coating column** in its bill of quantities, and a rate unit, "m2 coat",
that prices it.

## What it measures

The column covers every steel beam, column, member, plate, pile, railing or
stair flight. For each one it measures the outside: every face, the edges and
ends included. The figure comes from the part's own geometry. A simple body
has its faces added up. A rolled section with root radii, which the geometry
cuts into hundreds of small pieces, is measured from its profile's outline
swept along its length, and that works through Revit's mapped items and
clipped ends too. Only when the geometry gives nothing does the page fall
back on a stored `OuterSurfaceArea`.

The per-metre figures match the tables:

| section | measured here | table |
|---|---:|---:|
| 310UC96.8 column | 1.794 m2/m | 1.79 |
| 300PFC40.1 channel | 0.934 m2/m | 0.93 |
| W410x60 beam | 1.485 m2/m | 1.48 from its dimensions |

## Two traps the check found

**Tubes counted twice.** The faces of a hollow section include its bore. On
one Tekla model, six 193.7 mm tubes first read at twice the figure Tekla
stores. Paint and fire protection go on the outside only, so the column
sums the outside and puts the bore in a column of its own. Galvanising does
coat the bore, so that figure is still there for anyone pricing hot-dip.

**Flat bars without their edges.** On an ArchiCAD model, every 80 x 8 mm
flat bar stores 160/176 of its faces: the two wide faces times the length,
with the edges left out. Those edges get painted too, so the column sums the
faces and counts the disagreement.

## On 30 public models

Eight of the 30 models have steel parts. Of those 825 parts, 797 get a
coating area, 3,116 m2 in all. 295 of them also carry a stored skin figure,
and 185 of those agree within 2%. The 28 parts left without a figure are coped
beams in one Revit model, cut by faceted solids. That's the next thing to
read. The method and every number are in
`ventures/ifc-quantity-takeoff/eval/coating-area-2026-11-24.md`.

The model is read in your browser and nothing is uploaded. The quantities
are only as good as the model, so check them against the drawings and your
specification before pricing.
