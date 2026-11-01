---
title: "How big a motor does it take to catch a boom drop?"
date: 2026-11-01
tags: [heavy-hydraulics, excavator, energy-recovery]
description: A peaky boom-lowering profile needs a recovery device rated about 1.2 to 1.6 times the mean power to catch 95% of the drop, not the 2x guessed earlier.
---

An excavator boom coming down releases energy in a couple of seconds. A device that recovers it (an accumulator or an electric machine) can only take what its power rating allows. The last step in the heavy-hydraulics programme capped recovery by rating on a flat power profile and guessed that a real, peaky drop would need "perhaps 2x more". This step measures that guess.

Four assumed shapes carry the same energy over 2.5 s: flat, trapezoid, half-sine and triangle. For each, the rating that catches 95% of the energy is 0.95, 1.17, 1.35 and 1.55 times the mean power. Only the worst shape, the triangle, reaches 2x, and only to catch 100%. At the earlier medians that is about 1 to 1.3 kW for a 300 kg arm and 3.4 to 4.5 kW for the heaviest corner of the sweep.

The shapes are assumed, not read from a boom-lowering trace, and no machine was measured. The script is stdlib Python with a test against the analytic triangle result. Code and log: `research/heavy-hydraulics/`.
