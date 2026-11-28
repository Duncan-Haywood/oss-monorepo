---
title: A free roof calculator that lays out every rafter, and how much sheathing waste to add
seo_title: "Roof sheathing waste factor, gable vs hip, measured"
date: 2026-11-03
updated: 2026-11-28
description: Roof sheathing waste on 16 roofs laid out course by course: gable 3.4 to 16.6%, hip 4.4 to 16.2% with hip offcuts reused, and a free roof calculator.
tags: [wall-framing, residential-takeoff, for-customers, roof, construction, estimating]
---
Most roof calculators divide area by a number. The new [roof calculator](../../ventures/wall-framing-takeoff/roof-calculator.html) places rafters at your spacing, cuts the 4 x 8 sheathing in staggered courses up each slope, and counts roofing squares, bundles, felt and drip edge from the real edge lengths.

For a 24 x 40 ft house at 6:12 with 12 in overhangs it gives 62 2x8 rafters of 173-9/16 in, 44 sheets, 12.2 squares and 41 bundles at 10% waste. Those figures come from hand-checkable geometry (rafter length is run plus overhang times the square root of 1 + (6/12)^2), and `page.test.mjs` pins them to the engine. A hip roof works too, and the page shows the engine's message when a rafter is longer than the stock list (a 24 ft wide hip needs longer boards than 16 ft).

It runs in the browser, sends nothing anywhere, and is not checked against any span table or code. Checked in Chromium on gable and hip inputs; no real builder's roof order has been compared yet.

## How much sheathing waste to add, gable vs hip (2026-11-28)

Estimators add 10% to a gable roof's sheathing and 15% to a hip roof's. We laid
the 4 x 8 sheets out course by course on sixteen rectangular roofs (24 x 32 to
36 x 60 ft, at 4, 6, 8 and 12:12) and counted the sheets against each roof's
area. The full table is on
[roof sheathing waste factor, gable vs hip, measured](https://marisstella.app/residential-takeoff/roof-sheathing-waste-factor).

- **A hip roof has no more area than a gable roof** on the same footprint,
  pitch and overhangs: both are the footprint times the slope factor. Any extra
  sheets are cutting waste.
- **Gable roofs needed 3.4 to 16.6% over their area.** A flat 10% ran short on
  3 of the 16 and was more than twice the need on 5.
- **Hip roofs needed 13.0 to 32.7% when each course was cut on its own** and the
  triangles at the hips were thrown away, which is what this free calculator
  counts. Starting other courses with those triangles saved 4 to 10 sheets a
  roof and brought them to 4.4 to 16.2%, within 1 fewer to 3 more sheets than
  the gable roof on every footprint. Residential Takeoff, the paid edition,
  does that by default; it is in early access, so every feature works now.
- **The top course decides most of the spread.** The slope is rarely a whole
  number of 4 ft courses, so the last course is a ripped strip. A strip just
  over 24 in wide gets one per sheet (28 x 40 ft at 8:12: 16.2%), a 5 in strip
  gets nine (32 x 48 ft at 8:12: 3.4%).

These are rectangles with no valleys, dormers or skylights, 12 in overhangs
and rafters at 16 in; damaged sheets and cut-outs are a separate allowance.
`roof-waste-bench.test.mjs` pins every figure on the page to the engine.
