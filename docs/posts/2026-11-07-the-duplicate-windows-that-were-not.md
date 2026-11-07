---
title: "The duplicate windows in a real house plan were not duplicates"
date: 2026-11-07
description: "A framing takeoff refused a real Revit house because of apparent duplicate windows; the actual cause was an unfilled cut behind them, now dropped by the IFC reader."
tags: [wall-framing-takeoff, ifc, construction]
---

Yesterday's run of a real wood-frame house (OpeningDesign's Schultz Residence) stopped on a wall with 13 doors and windows, several seemingly listed twice at the same offset. Today's look says they are not twice: an awning window sits over a casement window, same offset, different sill heights. The blocker was one unfilled 78 in cut, 37 in tall, that Revit left behind the first door and window.

The IFC reader now drops an unfilled void that fills cover at least half the width of, and one under 12 in tall (pipe and box holes). On the file, refusals fell from at least 5 walls to 1 on the 1st Floor, 3 on the 2nd and 2 on the 3rd. What still stops it is real: doors at 0 in on short stub walls, one 30 x 21 in hole at a wall start, and two tees 0.1 in apart.

Limits: the 12 in and half-width thresholds were set from this one house, and no framer's takeoff has been compared. Notes are in `ventures/wall-framing-takeoff/README.md`.
