---
title: "A mullion whose cross-section is half its surface, and footings we cut on a slant"
seo_title: "IFC CrossSectionArea checks: Revit half-surface figures"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "58 Revit mullions store half their surface as CrossSectionArea, and mitred footings were cut on a slant. Unexplained IFC cross-sections fell from 77 to 2."
---

The free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
checks every quantity a model stores against the geometry it describes. On
the eight public models we test it on, 77 stored cross-section areas on
columns, beams and members had no explanation. As of today 75 do, and 13 of
those were our mistake, not the file's.

## Half a surface

The HHS Office architect model has 58 curtain-wall mullions, 6 x 15 cm posts
with a cover strip, whose section is 0.0095 m2. Their quantity set says
CrossSectionArea 0.49 to 1.04 m2, a hundred times too big and different on
almost every piece.

The figure grows with the piece's length, so it looked like a face area. It
is close: the mullion's body is a surface model with 18 faces, and their
areas add up to 1,321,440.357 mm2. Half of that is 660,720.179 mm2. The file
stores 660,720.179 mm2. All 58 match to within 0.5%, and of the other 2,093
cross-section figures on the eight models, none is half its body's surface.

So the engine now computes each member's surface and names this cause
(`half-surface`). The stored figure is set aside and the bill of quantities
uses the section. One export (and a later revision of it) shows this, so the
next Revit file may not. If it does, the check will say so.

## Footings cut on a slant

The schependomlaan model's strip footings store 0.125 m2, which is exactly
their 500 x 250 profile. We computed 0.134. Those footings are faceted, six
flat faces with no extrusion to tell us which way they run, so we cut them
across the direction of their longest end face. Their ends are mitred, which
made the cut a slant through the profile, 7% too big (1 / cos 21 deg).

The faces did show the axis. All of a prism's side faces lie along its
axis, so the engine now cuts across the direction that the most face area
runs along. For a plain box that is still its longest edge. Thirteen of the
17 footings now agree. The other five are stubs about as short as they are
wide, where no rule based on faces can tell which way they run, and each
stores its own width x height. That is named too, and the stored figure is
trusted.

Across all stored areas, unexplained disagreements fell from 192 to 117 of
12,167. The method and every count:
[eval/cross-sections-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/cross-sections-2026-11-20.md).

*The figures are estimates for checking a model. They are not a substitute
for a quantity surveyor's measured bill.*
