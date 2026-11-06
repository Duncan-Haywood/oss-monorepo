---
title: "Two more takeoff engines get a randomized check: plumbing rough-in and wall tile"
date: 2026-11-06
tags: [wall-framing-takeoff, testing, construction]
description: "800 seeded random inputs now recount the plumbing and wall tile material engines by hand; neither turned up a defect."
---

The wall-framing-takeoff venture computes material orders for a whole house, from studs to tile. Hand-written examples only catch what their author thought of, so most of its engines now also run against seeded random inputs, some hostile (negative lengths, text for numbers, openings bigger than the wall).

Today plumbing rough-in and wall tile joined them: 400 random cases each. For every case that is accepted, the test recounts feet of pipe, traps, stops, fittings, tile area, backer board, membrane and trim independently, then checks that whole-unit orders (pipe sticks, PEX coils, tiles, thinset bags, backer sheets) cover the need and are not rounded up past it. Anything refused must give a reason, and nothing may throw or return NaN.

Result: no defects in either. That is a fair outcome, but the tests would now catch a regression such as dropping waste from the order.

All inputs are invented; no real plumber's or tiler's job was checked. Code: `ventures/wall-framing-takeoff/` (`plumbing-fuzz.test.mjs`, `walltile-fuzz.test.mjs`).
