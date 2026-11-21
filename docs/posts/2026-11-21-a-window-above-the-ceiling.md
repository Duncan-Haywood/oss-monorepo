---
title: "A window above the ceiling: cutting openings at the room's height in a wall-finish takeoff"
seo_title: "Net wall finish from IFC: openings cut at the room's ceiling"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, estimating]
description: "IFC Quantity Takeoff now takes off only the part of a window below a room's ceiling. Cutting at the floor as well was wrong, as door frames showed."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) works out a
room's wall finish as its perimeter times its height, then takes the doors,
windows and curtain walls off
([how that works](2026-11-21-a-room-is-not-a-storey.md)). The height is the
height of the room's solid in the model. A room drawn to a 2.44 m ceiling
counts no wall above 2.44 m. A 2.9 m window in that room was still taken off
in full, so the net figure lost wall it never had.

The fix sounds like one line: take off only the share of each opening that
lies inside the room's height. Run on the 12 public models we test against,
that first version cut 203 openings. Nearly all of them were doors, cut at
the bottom:

- FM_ARC_DigitalHub's escape doors have bodies from -0.15 m to 2.25 m. The
  door stores a height of 2.25 m. The 15 cm below the floor is frame set
  into the floor build-up, not door.
- schependomlaan's door frames run 6-11 cm below the finished floor, and
  HouseZ's doors start 51 cm below it.

The stored OverallHeight already leaves that part out, so cutting it made
the deduction smaller than the door. schependomlaan lost 10.9 m2 of real
door area, 1.6% of its doors and windows. So the rule now cuts only at the
top: an opening that reaches more than 5 cm above the room's top comes off
for the part below it, measured from the room's floor.

With that rule, 56 openings are cut and 10 of the 12 models are unchanged.
The figures, from `eval/ceiling-cut-2026-11-21.md`:

| model | doors and windows off, before | after | openings cut |
|---|---:|---:|---:|
| ARK_NUS skolebygg (a Norwegian school) | 2,805.5 m2 | 2,768.8 m2 | 55 |
| Office_A | 486.6 m2 | 486.2 m2 | 1 |
| all 12 models | 6,913.7 m2 | 6,876.6 m2 | 56 |

37.1 m2 goes back on the wall, about half a percent of the doors and
windows. It is a small figure, but it sits in particular rooms: on ARK_NUS
it touches 36 rooms, and in one teachers' workroom three windows each lose a
quarter of their area.

There is a catch the numbers alone hide. In 40 of those ARK_NUS rooms the
height is 2.4384 m, which is 8 ft, Revit's default room height. In those
rooms the stored height and the solid agree, so the cut follows the file. But
a room left at the default was probably never drawn to its real ceiling. Then
the gross wall area is short as well, and the cut only makes the net figure
agree with it. The tool can make the arithmetic consistent. Whether 2.44 m is
the real ceiling is for an estimator looking at the drawings.

The new figure is in the room schedule's CSV as its own column, "Door and
window area above the room's top", and in the room table's tooltip, so the
cut is visible, not silent. Calling `deductOpenings` with `{ clip: false }`
gives the old figure back.

Still open: a door above a raised threshold is still taken off in full, and
a window under the low side of a sloped ceiling is not cut, because the top
used is the solid's highest point. Like everything in this tool, these are
estimates from the model's geometry, not professional advice: check them
against the drawings before pricing.
