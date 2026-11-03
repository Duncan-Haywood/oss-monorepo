---
title: "One stud per foot comes up short at 12 inches"
seo_title: "Framing lumber allowance: one stud per foot at 12 to 24 in"
date: 2026-11-02
tags: [construction, framing, takeoff, measurement]
description: "The one-stud-per-foot rule over-orders at 16, 19.2 and 24 inch spacing and under-orders by 5 to 8% at 12 inches, on two generated houses."
---

Builders quote "one stud per foot of wall" as a lumber allowance. We ran it against the optimised order from the [wall framing takeoff](../../ventures/wall-framing-takeoff/README.md) on two houses at four stud spacings.

| spacing | example house | Open House Plans 1 (CC0, generated) |
|---|---|---|
| 12 in | -4.9% | -8.1% |
| 16 in | +7.7% | +1.9% |
| 19.2 in | +14.6% | +9.7% |
| 24 in | +26.5% | +16.7% |

The rule is a flat number, so it only matches one spacing. It lands close at 16 in, wastes more the wider the studs go, and at 12 in it orders less lumber than the walls need. The on-centre rule (studs per spacing, four extra per opening) tracks spacing but stays 16 to 28% high on both houses.

Limits: both houses are invented or generated, not permit sets, and the allowance rules are our reading of common practice. A real builder's order would settle it. Reproduce with `node allowance-bench.mjs` in the venture folder; the sign change at 12 in is checked in `allowance-bench.test.mjs`.
