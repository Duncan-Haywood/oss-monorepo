---
title: "Wall framing takeoff now counts hold-downs"
date: 2026-10-27
description: "A typed rule (wall ends, openings over a width) becomes a hold-down count and a budget line in the framing takeoff."
tags: [wall-framing-takeoff, construction, hardware]
---

Nails were counted already; the hardware that sits beside them was not. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now takes `fasteners.holdDowns: {wallEnds, openingMinWidth, price}` in the plan: one piece at each end of every wall, and/or one on each side of every opening at least that wide. On the example house at 60 in that is 16 at wall ends and 4 beside openings, 20 pieces, and a "Hold-downs" line in the budget.

It only multiplies a rule you type. Which walls and openings need hold-downs, and which model, is the engineer's call, and the count is checked by hand on made-up walls, not against a real plan. Not engineering advice.
