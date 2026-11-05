---
title: "Running every flag of a framing calculator on awkward plans"
seo_title: "Testing a wall framing takeoff CLI across every report flag"
date: 2026-11-05
tags: [wall-framing-takeoff, testing, construction]
description: "28 report flags of the open-source wall framing takeoff run on four plan shapes found no crashes, and the sweep is now a test."
---

The wall framing takeoff command line has dozens of report flags: floor, deck, roof, siding, drywall, budget and more. Earlier sweeps called library functions with hostile values. This one went through the front door instead.

Each flag ran on the example house, a single wall, a plan with no openings and a plan of 24 in walls, then all flags together, then 11,000 in walls by hand. None threw a raw error or hung. A clean result is still worth keeping, so `cli-sweep.test.mjs` now runs 28 flags on four invented plans and fails on any raw TypeError, RangeError or ReferenceError, or a hang. It takes about 13 seconds. No real builder's plan was used.
