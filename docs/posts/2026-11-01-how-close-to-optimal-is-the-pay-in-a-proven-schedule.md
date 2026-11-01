---
title: "Once coverage is proven, how far from optimal is the pay?"
date: 2026-11-01
tags: [shift-roster-builder, optimization, scheduling]
description: On twelve seeded weeks the roster builder proved coverage on eleven, and on those the pay sits within 0.7% of its lower bound.
---

The shift-roster builder puts open hours first and pay second. Its exact search proves the fewest open hours a week can have, then reports a lower bound on the score. An open question in its roadmap was whether a tighter pay bound is worth building.

A new bench, `eval/pay-gap-bench.mjs`, answers it for one generator. Twelve seeded weeks of 8 people and 22 shifts: coverage was proven on 11. On those, pay is within $0.00 to $15.69 of the bound, median $4.15, at most 0.7% of a week costing $1,379 to $2,612. Two weeks are proven optimal outright.

So at this size a stronger pay bound can recover about $16 a week at most. The twelfth week is a different story: 86 open hours against a proven floor of 84, a coverage gap worth whole hours. The next milestone is therefore the coverage bound (branch-and-price), not pay.

Caveats: invented weeks, hard rules only, one run each, not a real payroll.
