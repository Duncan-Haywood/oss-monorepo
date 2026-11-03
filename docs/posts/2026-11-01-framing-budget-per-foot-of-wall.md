---
title: "A framing budget per linear foot of wall"
date: 2026-11-01
tags: [wall-framing-takeoff, estimating, budget]
description: The framing takeoff budget now reports its total divided by the feet of wall in the plan, next to the per-square-foot-of-floor figure.
---

Builders compare houses by a ratio, so the budget now gives two: total per sq ft of floor framed (landed earlier today) and total per linear foot of wall.

The wall figure is the whole budget (materials, tax, contingency and typed labor) over `summary.wallFeet`. It is a ratio for comparing plans, not what the walls alone cost. While any line is unpriced, the figure is marked partial, since unpriced lines are left out of the total.

Checked in `budget.test.mjs`: the figure equals total / wall feet rounded to cents, and it is null when the plan has no walls. No real bid has been compared, and no prices ship with the tool; you type your own.
