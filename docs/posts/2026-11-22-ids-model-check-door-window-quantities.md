---
title: "Three Revit exports, three answers for a door's height"
seo_title: "IFC door and window Qto_ quantities: what exporters store"
date: 2026-11-22
tags: [ids-model-check, ventures, bim, ifc]
description: "IDS Model Check now fills ARCHICAD doors' and windows' Qto_ sizes from the opening each fills, 377 of 380 exact. Revit's exports disagree, so they get none."
---

A door and window schedule, a glazing takeoff or an energy model reads four
figures off every door and window: `Width`, `Height`, `Area` and `Perimeter`
from `Qto_DoorBaseQuantities` or `Qto_WindowBaseQuantities`. An IDS file that
asks for them fails every element of an export that left them out. Until
today, [IDS Model Check](../../ventures/ids-model-check/)'s model fill could
measure walls, slabs and beams from their geometry, but sent every door and
window to a table for a person to type into.

A door seems to carry the answer already. IFC gives `IfcDoor` and
`IfcWindow` two attributes, `OverallWidth` and `OverallHeight`. The body is
there too, and so is the opening the door fills in its wall. So which of the
three did the exporters measure? I checked against every stored figure in the
public test models of two open repositories (opensourceBIM's IFC-files and
That Open Company's web-ifc test set).

## ARCHICAD measures the opening, exactly

On three ARCHICAD exports, all four figures equal the opening's on 315 of 315
elements, to the last digit. The opening is taken into the door's own
placement, where x is the width and z the height. The two round windows in
the FZK-Haus model were the giveaway: 1 x 1 m, `Area` 0.7851 m², which is the
circle's, and `Perimeter` 4.0 m, which is the bounding square's. Width times
height would have said 1 m², 27% too much. The opening's own section across
the wall gives the right area. Twice width plus height gives the perimeter
ARCHICAD wrote.

## Revit gives three different answers

The three Revit exports each store something else:

- **Revit 2010** (the HHS Office architect model) stores the `OverallWidth`
  and `OverallHeight` attributes. Four steel-framed doors store 0.9339 m, a
  width that neither the attributes (0.885 m) nor the opening give.
- **Revit 2019** (a Norwegian school, ARK_NUS) stores neither. Doors typed
  `10x21M` store 0.99 m in a 1.01 m opening, and `14x14` windows 1.39 m in a
  1.42 m opening. Its `Area` is larger than width times height: 2.86 m² on a
  1.42 x 1.42 m window.
- **Revit 2022** (a small German flat) stores the opening's width. On windows
  it stores the opening's height too, 1.35 m, where `OverallHeight` says the
  frame's 1.365 m. On doors it stores the leaf's nominal height, 2.05 m (the
  type's `Rohbauhöhe`), inside a 2.15 m opening.

Any single rule writes wrong figures into at least one of these three. So the
fill writes none for Revit and leaves those rows in the to-fill table. A
wrong number that passes an IDS check is worse than a gap the check reports.

## What it does now

For ARCHICAD exports, a door or window that fills exactly one opening gets
the four figures from that opening. It gets nothing if the opening is more
than 1% off the element's own attributes. Four of schependomlaan's windows
are why: 0.9 x 1.5 m windows sit in a 1.53 x 2.637 m opening and store a
0.30 m width, which no reading reproduces. On four public ARCHICAD exports,
380 elements are offered. All 380 are within 2% of the stored figures, and
377 match to the last digit.

To test the fill from end to end, I renamed every stored quantity so the
model no longer had them, then asked the fill for all four. It wrote 1,824
values, and the 1,520 that have a stored figure all match it. IfcTester,
buildingSMART's reference checker, takes exactly the written elements from
fail to pass.

It is on in the CLI with `--fill --from-geometry` and on the page with the
*Measure missing Qto_* checkbox. The full write-up, with every table, is
[`eval/door-window-quantities-2026-11-22.md`](../../ventures/ids-model-check/eval/door-window-quantities-2026-11-22.md).
Still open: a rule for Revit, and the 390 of schependomlaan's 464 doors and
windows that fill no opening at all.
