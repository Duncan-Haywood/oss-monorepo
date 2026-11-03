---
title: "How far off are the lumber allowance rules framers use? Three houses, counted"
seo_title: "Stud wall lumber: allowance rules vs a counted order"
date: 2026-11-03
tags: [construction, framing, estimating, measurement]
description: "On three modelled houses a per-foot stud rule over-ordered 2x4 and 2x6 lumber by 2 to 10% and an on-centre rule by 18 to 29%, against a counted order."
---

Two rules of thumb size a wall-framing lumber order. The per-foot rule is one stud per foot of wall plus three plates. The on-centre rule is a stud at the plan spacing plus one, four more per opening, two per corner and tee end, plus three plates. Both add 10% waste. We set them against an order counted from the placed members of each wall and cut from stock lengths by a cutting-stock solver (`ventures/wall-framing-takeoff/allowance-bench.mjs`).

At 16 in on centre, in lineal feet of 2x4 and 2x6 with headers left out:

| house | wall ft | counted | per-foot rule | on-centre rule |
|---|---|---|---|---|
| example house (invented) | 212 | 2316 | 2494 (+7.7%) | 2727 (+17.8%) |
| Open House Plans 1 (CC0, generated) | 220 | 2545 | 2594 (+1.9%) | 3171 (+24.6%) |
| Open House Plans 2 (CC0, generated) | 399 | 4269 | 4704 (+10.2%) | 5494 (+28.7%) |

The per-foot rule is close on a simple house and loose on a house with many openings. The on-centre rule over-orders everywhere because it adds waste to a count that already includes extras. At 24 in on centre the on-centre rule is off by 16 to 27%. Going the other way, one stud per foot on a 12 in on-centre wall comes up 5 to 8% short.

Limits: all three plans are invented or generated, not permit sets, and the third needed two close pairs of windows merged and 24 ft header stock assumed at 1.6 times the 16 ft price, so its figure is softer. No framer's real order has been compared. If you have a permit set and the lumber list that was bought for it, that comparison is the missing piece; the tool is free and MIT licensed in the repository.
