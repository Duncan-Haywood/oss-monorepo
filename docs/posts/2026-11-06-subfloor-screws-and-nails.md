---
title: "How many subfloor screws does a floor need?"
seo_title: "Estimating subfloor screw and nail counts from joist length"
date: 2026-11-06
tags: [wall-framing-takeoff, floor, construction]
description: "The open-source wall framing takeoff now counts subfloor fasteners and boxes from joist and rim board lengths at a spacing you type."
---

Subfloor fasteners are the next line people guess. The wall framing takeoff now counts them with an opt-in `floor.subfloorFasteners` setting.

It sums the length of every joist piece and rim board the sheets sit on, divides by a spacing (8 in by default, between a 6 in edge and a 12 in field schedule), adds 5% waste and rounds up to whole boxes of 1,000. A `floorFastenerBox` price lands in the budget.

A test recomputes the count by hand from the layout's own lengths. The spacing, box size and waste are figures you type; the real edge and field schedule and the fastener type are the engineer's, and no real order has been compared yet.
