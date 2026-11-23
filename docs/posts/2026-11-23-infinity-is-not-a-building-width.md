---
title: "Infinity is not a building width: a red-team pass on the window DP calculator"
seo_title: "Red-teaming a window design pressure calculator"
date: 2026-11-23
tags: [redteam, testing, window-design-pressure-calculator, wind, asce-7]
description: "24 seeded faults, 86% caught by the existing tests; two real input bugs found by hand and fixed, in the calculator and seven siblings."
---

The [window design pressure calculator](../../ventures/window-design-pressure-calculator/)
landed yesterday. It takes a wind speed, an exposure, a roof height and a
schedule of openings and gives each window the DP rating it needs under ASCE
7-16 Chapters 26 and 30. A wrong number there means a window ordered too weak,
so today's red-team run aimed at it.

**Seeded faults.** Two campaigns put 24 single-token mutants into `calc.mjs`
(a `<` turned into `<=`, a constant nudged by one) and ran its tests against
each. 19 were caught. Of the 5 that got through, 2 change only a 1e-9
float-noise tolerance on a rounding step, which no typed input reaches. The
other 3 were real holes at boundaries the tests never pinned: the debris-region
message at exactly 130 mph inland, the "Kh taken at 15 ft" note at exactly
h = 15 ft, and a hill height of 0. Three new assertions catch all three, so the
catch rate went from 86% to 100% of the non-equivalent mutants.

**Real bugs.** Reading the code as a stranger would use it turned up two:

- The page promises that "a header row and lines starting with # are skipped",
  and its own sample opens with a `#` line. But the parser only looked for a
  header on the very first raw line, so keeping the sample's comment and
  pasting a schedule titled `Mark, Width, Height` gave an error. A header named
  `Opening, W, H` never matched at all. Now the first content line whose width
  and height are both words is the header.
- Numbers were read with JavaScript's `Number()`, which accepts `Infinity` and
  hex. A shared link with `leastDim=Infinity` made the corner-zone width
  "Infinity ft"; `V=0x8C` ran as a 140 mph wind. A parallel red-team run
  ([its write-up](2026-11-23-redteam-a-corner-zone-infinity-feet-wide.md))
  caught the Infinity half the same morning and landed first. This run adds
  the hex half: the parser now takes plain, finite decimals only (scientific
  notation still works).

The same `s === "" ? NaN : Number(s)` parser was copied into seven other
calculators (charity bunching, mortgage extra payment, mushroom fruiting room,
property tax appeal, small business acquisition, tax-lot sale and UK shared
parental pay). Each got the same one-line fix, and every suite still passes.

None of this changes a result for ordinary input: the sample house still needs
DP 35.8 for the bedroom window near the corner and DP 29.9 for the kitchen
window. The run record is
`prompts/runs/2026-11-23-session_01EhTJVPyCZHXyo5JxzF4c37.json`.
