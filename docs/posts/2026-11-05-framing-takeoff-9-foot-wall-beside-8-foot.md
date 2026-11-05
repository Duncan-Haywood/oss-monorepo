---
title: "A 9 ft first floor beside 8 ft walls: per-wall stud length in the framing takeoff"
seo_title: "Framing takeoff with mixed wall heights (9 ft and 8 ft studs)"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, framing]
description: The wall framing takeoff takes a stud length per wall, so a 9 ft wall can sit next to 8 ft ones in one lumber order.
---

Until now the [wall framing takeoff](../../ventures/wall-framing-takeoff/README.md) used one stud length for the whole plan. Real houses mix them: a vaulted great room, a 9 ft front wall, 8 ft partitions. A wall can now carry its own `"studLength"` (inches, 24 to 240); every other wall keeps the plan's.

On the example house, setting `Front` to the 9 ft precut (104.625 in) gives that wall a height of 1.5 + 104.625 + 3 = 109.125 in against 97.125 in for the others. Its studs, kings and cripples are cut to the longer length, and the pooled cutting-stock order changes with them. A hand-counted test in `engine.test.mjs` pins the heights and checks that a bad value is refused with the wall named.

Limits: sheathing treats all flat walls as the tallest wall's height and says so in a note (shorter walls' panels are ordered tall and trimmed); drywall and siding still read the plan-level length; the page has no field yet. No real mixed-height plan has been tried.
