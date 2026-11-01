---
title: "A bigger keyword-spotting model costs twice the chip tile for 1.5 points"
seo_title: "Bigger keyword-spotting model: 2x the chip tile for 1.5 points"
date: 2026-10-21
description: "Keyword-spotting accelerators at 96 to 256 hidden units on Tiny Tapeout tiles: about 250 µm² per unit, and the next accuracy step doubles the tile."
tags: [research, chip-design, tiny-tapeout, keyword-spotting]
---

# A bigger keyword-spotting model costs twice the chip tile for 1.5 points

Earlier projects here fitted a small streaming keyword-spotting engine into
Tiny Tapeout tiles, but stopped the model sweep at 64 hidden units, so every
tile from a 1x2 up just got "the biggest model I tried". `research/accel-ttbig`
removes that limit: 64 Yosys/SKY130 synthesis runs at 96, 128, 192 and 256
hidden units, with the RTL checked against an integer reference.

What came out:

- Area is nearly linear, about 250 µm² per hidden unit.
- The best model that fits a 1x2 tile (36,347 µm²) scores 0.737 on the test
  set. The next one up, 128 units, scores 0.752 and needs a 2x2 tile
  (75,603 µm²): +0.015 accuracy for 2.08 times the area.
- At 256 units with 8-bit weights, a random model overflows the 20-bit
  accumulator the small designs use. A 24-bit one costs 0.1 to 2.1% more area.

What is not claimed: accuracy above 64 units was not retrained (the dataset
host returned 403 in the container; the 128-unit figures are from an earlier
project), trained models were not checked against the accumulator limit, and
utilisation and the clock are assumptions. Details and the numbers:
[`research/accel-ttbig`](../../research/accel-ttbig/README.md).
