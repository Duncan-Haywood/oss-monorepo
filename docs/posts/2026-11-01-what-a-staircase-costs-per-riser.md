---
title: "What a staircase costs: a per-riser labor line in the framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, estimating]
description: The framing takeoff budget now prices stair labor per riser from a rate you type, across every flight in the plan.
---

Stair carpenters often quote by the riser, so the budget now does too. Type `laborStairRiser` under `prices` and the Labor section gains a line: the risers of every stair in the plan (both flights of a stair with a landing, and a deck's own stair) times your rate. Labor is not taxed or given contingency, like the other labor lines.

Hand check from the test: a 108 in rise at the 7.75 in code limit needs ceil(108 / 7.75) = 14 equal risers, so a typed 40 per riser gives 560. With no stair rate typed the line is listed as unpriced and left out of the total; no rate is shipped. The page's price list and picker include the new name.

Not covered: finish stairs (skirts, newels, balusters) and any real contractor's rate.
