---
title: "Pricing the labor on a dormer in a framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, construction]
description: The framing takeoff's budget now adds a dormer labor line from a typed rate per square foot of dormer roof, and leaves it unpriced when you type none.
---

The budget already priced a dormer's lumber (by board foot) and its roof (by area), but a builder who typed labor rates for walls, floors and roofs got no labor line for the dormer. `laborDormerSqFt` closes that: a typed dollar rate per square foot of dormer roof, multiplied by the area the dormer module already computes.

Hand check, as in `budget.test.mjs`: 50 sq ft of dormer roof at 7 dollars is 350 dollars. With labor rates typed for other work but not this one, the line shows as unpriced rather than guessed. No rate is shipped, and none has been checked against a real contractor's quote, so treat the number as only as good as the rate you type. The page's price list and "Add a price line" picker include the new name.
