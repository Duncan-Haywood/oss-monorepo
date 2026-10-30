---
title: "What a real CAD door symbol did to our wall-framing import"
date: 2026-10-28
description: "Four real CAD door symbols, put in a made-up house, showed our DXF reader counting one double door as several 4-inch doors. Here is the fix."
tags: [wall-framing-takeoff, construction, dxf]
---

Our wall-framing takeoff reads a DXF floor plan and builds the wall list from
it. Until now it had only seen DXFs we or a sister tool generated. This run
put four real door symbols (from LibreCAD's open plan library) on a door layer
in a made-up 40 x 28 ft house.

A real symbol is not a line across the opening. It is a short jamb piece at
each side of the wall plus a swing arc per leaf. The reader took each jamb
fragment as its own door: one double door became several "doors" 4 to 9 inches
wide, and the header and king-stud counts followed.

The fix joins two jambs into one opening when a door-layer arc matches the gap
between them (one leaf) or half of it (two leaves). All four symbols now give
one door each: 131, 71 and 81 inches wide, measured jamb edge to jamb edge, so
the width runs a few inches over the rough opening. The output says so. Wide
pieces that are already openings are never joined, which an earlier version of
the rule broke on our own fixtures before the guard was added.

This is still a symbol library, not an architect's plan, and the README says
that. The test keeps made-up numbers with the same structure.
