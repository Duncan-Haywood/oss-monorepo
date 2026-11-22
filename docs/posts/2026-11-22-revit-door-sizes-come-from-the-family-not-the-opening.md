---
title: "Revit's door sizes come from the family, not the hole in the wall"
seo_title: "Fill Qto_DoorBaseQuantities on Revit IFC exports from Width and Height"
date: 2026-11-22
tags: [ids-model-check, ventures, bim]
description: "The free IDS checker now fills missing door and window Width, Height and Area on Revit IFC exports: 796 of 800 stored figures matched to the last digit."
---

When an information delivery specification (IDS) asks every door in a model
for `Qto_DoorBaseQuantities.Width`, `Height` and `Area`, and the model doesn't
have them, [IDS Model Check](https://marisstella.app/ids-model-check/) can
write them in. Until today it did that only for ARCHICAD exports. ARCHICAD
measures the opening a door fills, and we could reproduce its figures to the
last digit. Revit exports got nothing, because the three public Revit models
we test against seemed to disagree with each other and with the opening:

- a Revit 2022 door stored a 2.05 m height inside a 2.15 m opening;
- a Revit 2019 door stored 0.99 m wide in a 1.01 m opening;
- a Revit 2010 door matched its `OverallWidth` attribute most of the time.

No single geometric rule fitted all three, so the earlier run held back
rather than write wrong figures.

## Reading the exporter instead of guessing

Autodesk publishes the Revit IFC exporter's source on GitHub. Its
calculators answer the question directly. For a door or window:

- **Width** is the family's `Width` parameter, taken from the instance if it
  has one and otherwise from the type.
- **Height** is the family's `Height` parameter, looked up the same way.
- **Area** is width times height, and has been since at least 2018.
- **Perimeter** is the outer outline of the extruded body, so it comes from
  the geometry, not from the parameters.

So none of these figures is measured from the opening. They are what the
designer typed into the family. A German family's height can be the leaf's
nominal 2.05 m even though the wall opening is 2.15 m. That explains the
2022 file, and nothing in the geometry would have told us.

A Revit export carries those parameters as ordinary properties, grouped by
parameter group: `Dimensions(Type)` in English, `Bemaßungen` in German, and
`PSet_Revit_Type_Dimensions` in 2010's naming. So the checker can read them
back.

## How well it matches

On all three public Revit exports, against every figure Revit itself stored:

| Export | Widths exact | Heights exact | Areas exact |
| --- | ---: | ---: | ---: |
| Revit 2010 (office, 133 doors) | 129 of 133 | 129 of 133 | none stored |
| Revit 2019 (school, 568 doors and windows) | 568 of 568 | 568 of 568 | IFC2x3: not offered |
| Revit 2022 (flat, 99 doors and windows) | 99 of 99 | 99 of 99 | 99 of 99 |

The four misses are the same four steel-framed doors in the 2010 model.
Revit stored the frame's outer size for those, about 49 mm wider than the
nominal 885 mm. No exported property carries that figure, so the checker
writes the nominal size, which is 5% under. We know of no other way the rule
goes wrong.

We also tested the fill end to end. We hid the stored figures, asked for them
back, and then checked the result with IfcTester, buildingSMART's reference
checker. Every door and window in the 2022 flat went from failing to passing
on Width, Height and Area, and every door in the 2010 office went from
failing to passing on Width and Height.

## What it still won't do

- **Perimeter on Revit models.** Revit's figure comes from the body's
  outline, and none of the public exports stores one we could check against,
  so that request stays in the to-fill table.
- **Area on IFC2x3 Revit exports.** The 2019 model's older `BaseQuantities`
  set stores an area that isn't width times height on any of its 576 doors and
  windows.
- **Parameter-group names in other languages,** such as French or Norwegian.
  We will add them when a public export in that language turns up to check
  them against.

The full method, the scripts and every number are in the venture's
`eval/revit-door-window-quantities-2026-11-22.md`. The checker runs in your
browser, and the model never leaves your machine.
