---
title: A free roof calculator that lays out every rafter
date: 2026-11-03
description: A new browser page counts rafters, sheathing sheets and shingle bundles for a gable or hip roof from the same engine as the framing CLI.
tags: [wall-framing, roof, calculator, construction]
---
Most roof calculators divide area by a number. The new [roof calculator](../../ventures/wall-framing-takeoff/roof-calculator.html) places rafters at your spacing, cuts the 4 x 8 sheathing in staggered courses up each slope, and counts roofing squares, bundles, felt and drip edge from the real edge lengths.

For a 24 x 40 ft house at 6:12 with 12 in overhangs it gives 62 2x8 rafters of 173-9/16 in, 44 sheets, 12.2 squares and 41 bundles at 10% waste. Those figures come from hand-checkable geometry (rafter length is run plus overhang times the square root of 1 + (6/12)^2), and `page.test.mjs` pins them to the engine. A hip roof works too, and the page shows the engine's message when a rafter is longer than the stock list (a 24 ft wide hip needs longer boards than 16 ft).

It runs in the browser, sends nothing anywhere, and is not checked against any span table or code. Checked in Chromium on gable and hip inputs; no real builder's roof order has been compared yet.
