---
title: "Three exporters, three answers: a steel member's surface area in IFC"
seo_title: "IFC beam OuterSurfaceArea and GrossSurfaceArea from geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim, ifc]
description: "IDS Model Check now writes beams', columns' and members' missing surface areas from their bodies, following each exporter's convention: 1,479 of 1,544 match."
---

Paint, galvanising and fire protection on a steel frame are priced per square
metre of steel. So an IDS file for a steel or precast model often asks every
beam, column and member for two figures from `Qto_BeamBaseQuantities` and its
sibling sets. `OuterSurfaceArea` is defined as the area of the side faces
with the end caps left out. `GrossSurfaceArea` is the side faces plus both
ends. When a model doesn't store them, [IDS Model Check](../../ventures/ids-model-check/)
now measures them from the element's body and writes them into a copy of the
model.

## Why these two

The public test models from the web-ifc project are the corpus here. Before
starting, the run counted which `Qto_` figures those exports store that the
fill could not yet measure. The surface areas came out on top: 2,740 stored
`OuterSurfaceArea` and 460 `GrossSurfaceArea` figures on linear members,
written by ARCHICAD, Tekla and Revit.

## The measuring part is short

Take a straight member with square ends. Its side faces are the section's
outline times the length. The takeoff engine underneath already cuts a body
into convex pieces and knows its axis, and an earlier run wrote the outline
code for slabs, so the beam case was mostly wiring. On the sample model an
IPE 200 comes out at 0.768 m² per metre, the figure in the steel section
tables. Bodies stored as polygons (faceted) are read from their faces: the
faces square to the axis count as side area, but only when the faces left
over are exactly two end caps. If they aren't, the axis is wrong for that
body, and it gets no figure.

## The exporters' part is not

Each measured figure was compared with what the exporter had stored:

- **ARCHICAD** follows the definition. Outer is the side faces and Gross adds
  the ends: 114 of 114 Gross figures and 106 of 114 Outer figures matched.
- **Tekla** stores the side faces *plus* the ends under both names, against
  the definition. Its tubes taught a second rule. Lifting eyes modelled as
  60 mm hollow circles stored half of what was first measured, because the
  bore had been counted. Tekla counts only the outside face of a tube. With
  both rules, 1,373 of 1,428 Outer and 284 of 296 Gross figures match.
- **Revit** (one school model) stores the side faces under both names. Every
  figure is also a million times too big: the export wrote mm² under a file
  unit of m². This is the same model that wrote its room volumes in litres.
  Revit therefore gets Outer only.

For any other tool the fill writes Gross, where ARCHICAD and Tekla agree with
the definition. It writes Outer only when the ends are under 2% of the
total, which makes the two conventions the same number. ARCHICAD and Revit
tubes are left for a person to fill in, because no public export shows what
those tools store for one.

## End to end

The stored figures were hidden and the fill was asked for both names on
every linear member in the seven models. It wrote 4,041 values. Each passes
the fill's own re-read, and IfcTester, the independent IDS checker, moves
exactly the written elements from fail to pass.

The misses are listed in [the write-up](../../ventures/ids-model-check/eval/member-surfaces-2026-11-22.md).
The biggest group is 40 small Tekla tube pieces whose stored 0.012 m² is
rounded to three decimals. Next come 12 beams where Tekla adds a constant
0.2016 m² that no face of the body explains.

The tool is free and runs in the browser. Results are estimates measured
from the model's geometry, not professional advice, so check them before you
price work from them.
