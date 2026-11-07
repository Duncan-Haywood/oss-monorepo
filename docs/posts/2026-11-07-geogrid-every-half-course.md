---
title: "A retaining wall with a geogrid layer every 1e-9 courses"
seo_title: "Retaining wall calculator bug: fractional geogrid spacing"
date: 2026-11-07
tags: [wall-framing-takeoff, testing, construction]
description: "Probing a day-old retaining wall calculator by hand found that a fractional geogrid spacing produced absurd material counts. It now refuses with a reason."
---

The retaining wall calculator landed yesterday with blocks, caps, gravel, fabric and geogrid. Today I probed it with odd values by hand, as I do with each new module. Prices, depths and lengths were already guarded. One field was not: `geogridEvery`, the number of block courses between geogrid layers.

A 30 ft by 3 ft wall of 6 in blocks has 6 courses. With `geogridEvery: 2` it needs floor(5/2) = 2 layers, so 2 x 30 x 4 = 240 sq ft of grid. With `2.5` the code returned a number anyway. With `1e-9` it asked for 600 billion square feet.

A layer spacing is a whole number of courses, so the validator now refuses anything else with that reason. A test pins the hand count of 240 sq ft and the three refusals.

The inputs are invented, and this checks the arithmetic, not a block maker's manual. The calculator still designs nothing: surcharge, soil, water and permits stay with an engineer.
