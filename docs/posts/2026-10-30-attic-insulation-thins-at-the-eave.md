---
title: "Why attic insulation never reaches full depth at the eave"
date: 2026-10-30
tags: [wall-framing-takeoff, insulation, geometry]
description: "At a 4/12 pitch and a 3.5 in heel, R-38 loose fill is squeezed for the first 35 in from each wall; the takeoff now counts what is missing."
---

R-38 loose fill at 2.5 R per inch settles to 15.2 in. Near the eave the roof comes down to meet the ceiling, so the fill cannot be that deep. Clear height at distance x from the wall is `heel + x * pitch / 12`.

**The numbers.** With a standard 3.5 in heel at 4/12, the clear height reaches 15.2 in at `(15.2 - 3.5) x 3 = 35.1 in`. On a 28 x 40 ft house that is a band of about 234 sq ft along the two eaves where the attic is below R-38, and about 114 cu ft of fill the old count ordered but could not fit. A raised (energy) heel of 15.2 in or more holds full depth to the wall.

**What changed.** `insulation.attic.heel` (inches) turns it on. The CLI reports the band width, its area and the missing cubic feet, and leaves them out of the bag count. The test checks the trapezoid by hand; no real truss heel has been measured against it.
