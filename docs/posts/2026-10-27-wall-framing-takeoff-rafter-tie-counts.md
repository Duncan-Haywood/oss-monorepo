---
title: "Wall framing takeoff now counts rafter ties"
date: 2026-10-27
description: "The nail counts gain a hurricane-tie count: one per rafter bearing, two per truss, with a price, from the CLI or the page."
tags: [wall-framing-takeoff, construction, roof]
---

A roof order that lists rafters but not the ties holding them to the top plate leaves a gap that shows up on the day the framers need the connectors. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now takes `fasteners.rafterTies` (`perBearing` 1 or 2, optional `price`) and counts them from the roof it laid out: one tie per rafter or jack rafter at its eave bearing, two per truss, one at each wall. The page has a matching select and price box under the nail options, and the count prints beside the hold-downs.

The count is the number of bearings times the ties your engineer's schedule puts on each. It does not pick a tie model or check uplift capacity, and it is hand-counted in tests only, not checked against a real roof order. Not engineering advice.
