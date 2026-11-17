---
title: "Let the leak's shape choose: the steepest ramp, else the newest source, finds 15 of 32 L-Town leaks"
seo_title: "Leak localisation on BattLeDIM: let the shape choose"
date: 2026-11-17
tags: [research, water-leaks, BattLeDIM, leak-localisation, water-distribution]
description: "On BattLeDIM's L-Town, picking the steepest ramp-shaped source, else the newest, places 15 of 32 leaks within 300 m, with 6 slow leaks and 9 bursts."
---

The [water-leaks](../../research/water-leaks/README.md) programme studies leak
detection and localisation on BattLeDIM's L-Town, a simulated water network
with two years of sensor data and a published leak schedule. Nothing here is a
field result.

[The last step](2026-11-17-leak-shape-right-timing-wrong.md) fitted each
recently dated leak source with a step or a ramp. The labels came out right:
every slow leak's nearby source was a ramp, and ramps are rare among the
candidates (about 1 in 6). But it then timed each change against the alarm, and
a slow leak that is still rising looks days older than it is, so the newest
source won again.

## The rule

Use the label, drop the timing. If any source dated in the last 30 days fits as
a ramp, pick the ramp rising fastest. If none does, pick the newest source. The
rule and five predictions went into the
[research log](../../research/water-leaks/LOG.md) before it was run.

## What happened

| rule | within 300 m (of 32) | bursts (15) | slow leaks (17) |
|---|---|---|---|
| steepest ramp, else newest (this step) | **15** | 9 | 6 |
| fastest-rising source (step 22) | 14 | 8 | 6 |
| newest source (step 21) | 13 | 10 | 3 |
| regression residual, no tracker (step 11) | 15 | 10 | 5 |
| one-leak oracle (upper bound) | 28 | 13 | 15 |

Four of the five predictions held: more than 14 overall, at least 6 slow leaks,
at least 9 bursts, and where a ramp source sits within 300 m of the leak, the
rule lands within 300 m for 11 of 13. It also placed two slow leaks that no
earlier tracker rule found. The fifth prediction, a significant win over the
newest-source rule, failed (3 leaks against 1, P = 0.63), as the plan expected.

## Why this is not a method claim yet

The rule was chosen after seeing the last step's per-leak shapes, on the same
32 leaks, so 15 is an in-sample number. It also only ties the plain regression
residual's 15, and it runs on a residual that removes demand with the
generator's own model, which a utility does not have. Fifteen leaks have no
ramp-shaped source at all; there the rule is just "the newest", right for 4.

The next test is out of sample: the same rule, frozen, on simulated leak years
from the L-Town model, where the leaks are new and a paired test has enough of
them to mean something.

Code, results and the per-leak table:
[`experiments/step24-shape-chosen/`](../../research/water-leaks/experiments/step24-shape-chosen/).
