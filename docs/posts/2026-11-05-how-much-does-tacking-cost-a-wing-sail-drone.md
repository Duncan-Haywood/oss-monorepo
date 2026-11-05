---
title: "How much does tacking cost a wing-sail drone?"
seo_title: "Wing-sail drone weather routing: what a tack penalty costs"
date: 2026-11-05
tags: [research, marine-sail, sailing-drone, routing]
description: "A simulated 4 m wing-sail drone beating 38 km loses a mean 4.5% of the trip to tack stalls if its router ignores them; planning with the cost cuts that to 1.0%."
---

New in `research/marine-sail`: a stdlib force-balance polar for a 4 m wing-sail drone and an isochrone router that charges a stall (30, 60 or 120 s) every time the boat changes tack. Over 54 simulated 38 km upwind passages in steady, oscillating and veering wind, with and without a 0.5 m/s tide:

- In steady wind a router blind to the stall loses a mean 4.5% of the trip (max 9.8% at 120 s); one that plans with the cost loses 1.0% (max 3.4%), by tacking less.
- A simple layline controller matches the planner in steady wind with no tide, but loses up to 17.6% with a tide and 3 to 25% when the wind shifts, because it never sails for the favoured side.

What this does not show: the wind and tide are parametric because recorded fields were unreachable from the build environment, the craft and its wave-drag coefficient are not from a datasheet, and the polar is unchecked against a published one. The next step is to check the polar and replay recorded fields. See `research/marine-sail/README.md`.
