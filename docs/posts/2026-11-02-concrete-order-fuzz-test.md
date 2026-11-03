---
title: "Fuzzing the concrete order: 400 random pours checked against an independent volume sum"
seo_title: "Fuzzing the concrete order"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: The slab, footing and pier concrete engine in the framing takeoff now has a seeded property test that failed when the bag rounding was broken.
---

The concrete engine in the wall-framing takeoff turns a slab, footing strip or round pier into cubic yards, a ready-mix order in quarter-yard steps and a count of bagged mix. It had hand-checked unit tests but no test over odd inputs.

A new seeded test (`slab-fuzz.test.mjs`) throws 400 random pours at it: sizes below and above the allowed range, bad shapes, fractional counts, waste above 50%, unlisted bag sizes. Each is either refused with a reason, or must satisfy:

- the volume equals a separate length x width x depth (or pi r^2 x depth) sum;
- the ready-mix order covers the volume plus waste and is never more than a quarter yard over;
- the bags cover it at the label yield;
- the short-load note appears exactly under 4 yards;
- more waste never orders less.

Changing the bag rounding from round-up to round-down makes it fail, so it does catch that class of error. The inputs are invented; no real pour or batch ticket was compared, and bag yields are label figures typed in the engine.
