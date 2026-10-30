---
title: "A stair stringer calculator that checks the board left under the notch"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs, framing]
description: "Type a total rise, get equal risers, the shorter first cut, stringer length and stairwell opening. It warns when the notch leaves under 3-1/2 inches of board."
---

Most stair calculators stop at "14 risers of 7-11/16 inches". The [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already had a stair engine behind its `--stairs` flag, so it now has its own page: the [stair stringer calculator](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/stair-stringer-calculator.html), which runs in the browser and sends nothing anywhere.

For a 9 ft rise with 10 in treads and 2x12 boards it returns 14 risers of 7-11/16", 13 treads, a first riser cut to 6-3/16" (one tread thickness short, so the finished first step matches), 4 stringers 14' 11-15/16" long, and 5-1/8" of board left under the notches. The stairwell opening needs to be at least 9' 11-15/16" for 6' 8" of headroom over a 12-1/2" floor.

Two things it checks that a riser-and-tread table skips: the throat (board depth minus R×T/√(R²+T²)) against the usual 3-1/2" minimum, and how far apart the stringers are against what the tread board can span. The limits are the model residential code's usual ones and are typed in, not looked up for your town; the page says so.

The numbers are hand-computed in `stairs.test.mjs`; no stair has been built from them yet. If you build one, tell us how it came out.
