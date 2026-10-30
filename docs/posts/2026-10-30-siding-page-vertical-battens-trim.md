---
title: "Vertical siding, battens and trim boards now work on the framing page"
seo_title: "Vertical siding, batten and trim takeoff in the browser"
date: 2026-10-30
tags: [wall-framing-takeoff, siding, takeoff]
description: "The wall framing takeoff page counts vertical board siding, a batten over each seam, and window and door trim boards, not only lap siding."
---

Earlier this week the [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) engine learned to count vertical board siding, battens over the seams, and head-and-jamb trim around each opening. Those options only ran from the command line. Today they are on the page.

Tick the siding box and choose "Vertical boards": the page counts full-height columns at the board coverage you type, leaves a piece above and below each opening, and, if you pick battens, adds one strip over every seam. Trim boards are counted per opening and packed into your stock length.

Honest limits: the arithmetic is checked by hand and by tests, not against a real siding order, and the new page fields are source-tested, not clicked through in a browser. If you have a real order to compare, the numbers are in the output for exactly that.
