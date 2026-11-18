---
title: "How wrong is one stud per foot? Measured on three houses"
date: 2026-11-04
description: "A counted framing order against the one-stud-per-foot rule at 12, 16, 19.2 and 24 inches on center: close at 16, a quarter high at 24, short at 12."
tags: [wall-framing-takeoff, construction, framing]
---

# How wrong is one stud per foot?

The rule of thumb for a framing order is one stud per linear foot of wall plus
plates. We set it against a counted order from the wall framing takeoff tool on
one invented house and two generated ones (lineal feet of 2x4 and 2x6, 10% waste
on every column).

At 16 inches on center the rule orders 1.9 to 10.2% more lumber than the counted
order. It cannot know the spacing, so at 24 inches it is 17 to 27% high on the
same houses, and at 12 inches it is 5 to 8% short. A spreadsheet formula that
follows the spacing but allows four studs per opening stays 16 to 29% high.

These are two generated plans and one invented house, not a builder's real
order, so they show how the rules behave rather than what a crew over-orders.
The full tables are on the new comparison page,
`ventures/wall-framing-takeoff/vs-stud-per-foot-rule.html`, and come from
`allowance-bench.mjs` in the same folder.
