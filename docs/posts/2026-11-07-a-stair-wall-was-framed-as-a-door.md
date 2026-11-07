---
title: "A stair wall's cutouts were being framed as a door"
date: 2026-11-07
description: "Dropping floating low voids as stair cutouts lets the wall-framing takeoff frame the Schultz Residence first floor: 213 pieces, 0.19% over the cutting-stock bound."
tags: [construction, ifc, wall-framing-takeoff]
---

After the IFC reader learned to drop voids that doors already fill, the Schultz Residence's 1st Floor still refused to frame. One barn-board wall beside the stair carries three unfilled voids stepping up in height, all starting above the floor and under 1.5 m. Merged, they looked like a 49 in door at the wall's end.

The engine now drops an unfilled void that floats above the floor (sill over 4 in) and tops out under 1.5 m as a stair cutout, with a warning to frame it by hand. The 1st Floor with `--wood-only` frames: 9 walls, 117.1 ft, 213 pieces from 138 boards, $1,326.84 against a $1,324.37 lower bound.

Limits: the thresholds come from this one house, and no framer's takeoff has been compared. The 2nd and 3rd Floors still stop on doors at the wall end.
