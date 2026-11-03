---
title: "A drywall calculator that counts the cuts, not just the area"
date: 2026-10-31
tags: [wall-framing-takeoff, drywall, framing]
description: "Room size, doors and windows in; sheets, screws, tape and compound out. A 12 x 12 ft room is 15.9 sheets by area and 17 to buy."
---

"Square feet divided by 32" undercounts drywall, because pieces cut around a door or off the end of a course do not always share a sheet. The [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already had a drywall engine behind `--drywall` that hangs each wall in 48 in courses and packs the pieces into sheets, so it now has its own page: the [drywall calculator](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/drywall-calculator.html). It runs in the browser and sends nothing anywhere.

For a 12 x 12 ft room with 8 ft walls, one 3 ft door and a ceiling, in 4 x 8 ft sheets: 508 sq ft of faces, which is 15.9 sheets by area, and 17 sheets once the cuts are counted. It also returns tape (1 roll), joint compound (2 pails at 0.01 gal per sq ft plus 10%), screws and corner bead.

The limits are stated on the page: horizontal courses only, ripped strips not reused, finishing figures are rates, not measurements, and a hanger's method may differ. The page is checked by a test that recomputes the 12 x 12 case from the engine, and was clicked in Chromium at phone width.
