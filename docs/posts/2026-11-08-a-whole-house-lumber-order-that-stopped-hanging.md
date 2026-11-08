---
title: "A whole-house lumber order that stopped hanging"
date: 2026-11-08
tags: [construction, optimization, wall-framing-takeoff]
description: "Ordering a three-storey house's framing lumber as one cutting-stock problem hung for 12 minutes; a dual bound and column pruning cut it to 48 seconds."
---

Ordering all three floors of a real wood-framed house together lets offcuts from one floor's boards become another floor's short pieces. The takeoff's `--stack` flag does that, and on the Schultz Residence model (a free, public Revit export) the run hung: 12 minutes of CPU, killed.

The 2x4 order was 183 distinct lengths and 922 pieces over seven board lengths. Column generation, the standard method for cutting stock, was tailing off: after 150 rounds it was still 1% from its own LP value, and every round re-solved a dense simplex on a pool of patterns that had grown past a thousand.

Two changes fixed it. Farley's bound, the current duals scaled by the best value-to-price ratio any board's knapsack reaches, is a valid lower bound every round, so the loop stops once the LP is within 0.01% of it. And patterns the LP does not use are dropped once the pool passes three times the item count.

Result: the stacked order finishes in 48 seconds: 49 walls, 980 pieces from 409 boards, cost 6179.52 against a lower bound of 6179.38, versus 6192.56 for ordering the floors apart (0.21% less). The per-foot price of 20 ft boards is a guess and no framer's takeoff has been compared; 48 s is still slow for a web page, so the next step is warm-starting the simplex.
