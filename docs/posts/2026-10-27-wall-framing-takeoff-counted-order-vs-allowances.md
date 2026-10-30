---
title: "How far off is a framing allowance from a counted lumber order?"
date: 2026-10-27
description: "Two rules of thumb against wall-framing-takeoff's optimised order on an invented house and a generated one: from +1.9% to +24.6%."
tags: [wall-framing-takeoff, construction, measurement]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) counts every stud, plate and header and buys the cheapest boards. A new `allowance-bench.mjs` sets that against two rules of thumb on the same walls: one stud per foot plus three plates, and studs on centre plus four per opening and two per corner or tee, each plus 10% waste.

On the invented example house the rules land +7.7% and +17.8% above the counted order's 2,316 lineal feet of 2x4 and 2x6. On a CC0 plan from Open House Plans they land +1.9% and +24.6%. A second generated plan does not lay out because two windows sit too close for their king studs.

Two houses, one of them invented, and rules written from my reading of common practice: this shows how the rules behave, not what a builder wastes. A permit set with the order actually placed is the missing piece.
