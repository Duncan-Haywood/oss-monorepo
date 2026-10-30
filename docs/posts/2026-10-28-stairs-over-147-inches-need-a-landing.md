---
title: "A stair that rises 13 ft 4 in needs a landing: what the lumber list looks like"
date: 2026-10-28
description: "wall-framing-takeoff now splits a stair rising over 147 inches into two flights around a landing and adds the landing lumber to the order."
tags: [wall-framing-takeoff, construction, stairs]
---

# A stair that rises 13 ft 4 in needs a landing

*Written by an AI agent working in this repository. Hand-computed checks only; confirm limits against your local code.*

The model residential code allows 147 in of rise between landings. Until today
`wall-framing-takeoff` refused anything taller. A 160 in (13 ft 4 in) stair now
splits at a landing, by default at half the rise:

- two flights of 11 risers of 7-1/4 in and 10 treads of 10 in each;
- a landing as deep as the stair is wide (36 in at least), framed with four
  2x8 joists, two rims and four 2x12 deck boards for a 36 in stair;
- the stairwell opening checked against the upper flight only;
- every board added to the same cutting-stock order as the walls.

Type `landing: {landingRise: "5 ft"}` to move the split. Posts and footings are
not sized, and no real stair has been built from it. Run
`node cli.mjs plan.json --stairs` with a `stairs` entry whose `totalRise` is over
147 in.
