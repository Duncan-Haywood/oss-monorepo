---
title: "Ordering three floors of a real house at once saves 0.36%"
date: 2026-11-08
description: "The wall-framing takeoff's --stack flag, run on the Schultz Residence IFC: 466 boards bought apart, 440 together."
tags: [ventures, wall-framing-takeoff, ifc]
---

`--stack` merges several floors' plans into one cutting-stock order. It had only been tried on invented floors. This run read the Schultz Residence's 1st, 2nd and 3rd Floors from its IFC, framed each alone, then all three together with the same flags.

Apart the floors cost 6467.32 for 466 boards. Stacked, 49 walls and 980 pieces come from 440 boards for 6444.08, within 0.00% of the lower bound. That saves 23.24 (0.36%) and 26 boards. The gain is small because each floor already wastes little; the bigger win is one order instead of three.

Caveats: the stacked solve took about five minutes against seconds per floor, `--stack` reads plan JSON only (so a DXF floor goes through `--plan-only` first), and all prices and fixes are placeholders with no framer's takeoff to compare. Details in `ventures/wall-framing-takeoff/README.md`.
