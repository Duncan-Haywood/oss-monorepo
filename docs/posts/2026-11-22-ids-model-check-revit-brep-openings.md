---
title: "Revit's window cuts with no quantities: reading the size off the brep"
seo_title: "Fill Qto_OpeningElement quantities on Revit brep openings"
date: 2026-11-22
tags: [ids-model-check, ventures, bim]
description: "Revit 2022 wrote 102 window cuts as breps with no stored size. IDS Model Check now reads them from their faces: all 102 match the window's own size."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) can fill in the
`Qto_OpeningElementBaseQuantities` an IDS asks for (an opening's `Width`,
`Height`, `Depth` and `Area`) by measuring each opening's body. Until today
that only worked when the body was an extrusion. One public Revit 2022 model,
`kleine_Wohnung` from the web-ifc test files, writes 102 of its 168
openings another way, and the fill left all of them empty: 408 values in the
to-fill table and a model that still failed the check.

## What those openings are

The house's outer walls are two walls in the model: 0.24 m of brick and a
separate 0.16 m layer of external insulation. Every window cuts through both,
and Revit writes each cut as an `IfcAdvancedBrep`, two boxes stacked one after
the other. A 1.65 x 2.35 m box runs through the brick, then a slightly smaller
1.59 x 2.15 m box runs on through the insulation, which forms the reveal. Each
window gets two of these cuts, one hosted by each wall, and only the cut in
the brick is linked to the window.

Revit stores no quantities on any of them. Its ordinary extrusion openings
in the same file store all four.

## Reading them from the faces

A box has no extrusion direction, so the reader looks for one. It takes a
horizontal face normal that every face is either parallel or square to, and
when there are two (a box always has two), it picks the one nearer the host
wall's thickness direction. Along that direction you get `Depth`. Upright you
get one side, across you get the other, and `Area` is the largest face square
to the through direction, which for a stepped cut is its outer section.

There were two bugs on the way. The host wall's body is stored in the wall's
own axes, not the world's. Reading it without that turn sent 44 of the 102
cuts along the wall instead of through it. And "the direction the wall is
thinnest" picks the wrong way on a wall stub shorter than it is thick (a
Norwegian school model has 68 openings in 0.33 m stubs of a 0.41 m wall), so
the wall's own Axis line now comes first.

## How we know it's right without a stored figure

There is no Revit figure to compare against, so the check came from two
other directions.

- **Where Revit did store figures**, the same face reading was run on all 824
  Revit wall openings that store the set, treating each as if it were a brep.
  It gives every stored `Depth` (738 of 738) and every `Width`/`Height` pair
  (824 of 824). On 162 of those, in the 2019 model, Revit had put the two in
  the other order. Revit 2022's own openings use the reader's order on 49 of
  49, so that is the order it writes.
- **Against the windows**, the window filling each cut carries its own Revit
  width and height. On all 102 cuts, including the insulation-wall twins (each
  matched to the window beside it), the reading gives the window's height as
  `Width` and its width as `Height`, within 0.1%.

End to end, with the model's stored figures hidden, the fill now writes 672
values instead of 264, and the filled file passes every check. IfcTester, the
reference checker from IfcOpenShell, opens it and takes the same 672 values
from failing to passing, with none newly failing.

## Limits

That is one model. All its brep cuts are stepped boxes in straight,
square-on walls. No public export we know of has a sloped, arched or round
brep cut, or a brep cut through a floor. Revit's floor-opening `Width` is a
profile side that a brep doesn't have, so floor cuts are still left alone.
The full write-up, with the commands to rerun it, is in
`ventures/ids-model-check/eval/opening-brep-quantities-2026-11-22.md`.

The checker is free, MIT-licensed and runs in the browser or as a CLI. Its
results are checks against your own files, not professional advice.
