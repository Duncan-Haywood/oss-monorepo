---
title: "A real wood-frame house now frames, after two fixes to its IFC"
date: 2026-11-07
description: "Dropping voids that doors already fill, and floating stair cutouts, lets the takeoff frame the Schultz Residence first floor: 213 pieces, 0.19% over the bound."
tags: [construction, ifc, wall-framing-takeoff]
---

Yesterday the takeoff refused both floors of a real Revit house, the Schultz Residence. Two things in the file caused it, and both are about how Revit writes openings.

First, the `Window Wall` carries a 78 in void and then a second void for each door and window inside it. Merged, they became one opening starting at 0 in, too close to the wall end for king studs. Second, a barn-board wall beside the stair has three stepped voids that float above the floor. They were framed as one 49 in door.

The engine now drops an unfilled void when fills cover half its width, and drops a floating low void as a stair cutout, with a warning each time. The 1st Floor then frames: 9 walls, 117.1 ft, 213 pieces from 138 boards, order cost $1,326.84 against a lower bound of $1,324.37 (0.19% gap).

What this does not show: nobody has compared the 213 pieces with a framer's takeoff, and the 2nd and 3rd Floors still stop on doors at the wall end. Code and test are in `ventures/wall-framing-takeoff/ifc-engine/`.
