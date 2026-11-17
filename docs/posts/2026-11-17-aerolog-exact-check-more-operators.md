---
title: "With 12 and 16 drone operators, the shortcut formula still picks the simulator's best altitude layers"
seo_title: "Drone layer-split formula checked exactly at 16 operators"
date: 2026-11-17
tags: [research, uav, airspace, reproducibility]
description: "Summed over all destination pairs, the simulator's expected drone conflicts match the closed form to 0.15%, and the best layer splits agree in 12 of 12 layouts."
---

`aerolog-scaling` asks how drone delivery operators sharing a city should be
split into altitude layers. Its last two steps gave three practical answers.
With 12 or 16 operators, a cheap 100 m raster of where each operator delivers
picks nearly the best two-layer split. Four layer groups leave under a tenth of
the en-route conflicts in shared layers. Adding layers by splitting each
existing group again costs about 15% more conflicts than re-planning all the
groups at once.

All three answers were scored on a closed-form estimate of the conflict rate
(cf_D+). That formula had been checked against the simulator's exact
expectation only at eight operators, where it was 0.26% high. With more
operators, more of the conflict weight comes from cross-operator traffic. That
is where the formula's known small error lives, so the check needed repeating.

**Today's step (11ae)** computes the simulator's exact expected conflict rate
(exact_D) for eight 12-operator and four 16-operator layouts. exact_D is a sum
over every pair of destinations, with no sampled flights. It takes about 1,700
and 2,600 CPU seconds per layout, against 160 to 270 for the closed form. Ten
predictions were committed before any layout ran.

| check | 12 operators (8 layouts) | 16 operators (4 layouts) |
|---|---|---|
| closed form / exact, pooled | 1.0015 | 1.0016 |
| worst layout | 1.0033 | 1.0023 |
| pair-weight correlation (worst) | 0.99996 | 0.99998 |
| closed form's best 2-layer split = exact best | 8 of 8 | 4 of 4 |
| closed form's best 4-group partition = exact best | 8 of 8 | 4 of 4 |
| conflict weight kept by best 4 groups (median, exact) | 8.8% | 8.4% |
| recursive bisection penalty, exact (closed form) | 7.5% (7.5%) | 20.9% (21.0%) |

Nine of ten predictions held. I expected near-ties to flip some splits, since
11ac had found the best two splits within 0.5% of each other in most
layouts. None flipped. The destination-raster rule's losses changed by at most
0.0001 between the two references.

The refuted prediction is about the reference itself. exact_D labels each
conflict as terminal or en-route with an 8-point quadrature. Its two 4-point
halves disagreed with it by up to 1.3%. I predicted at most 0.1% and wrote
that this had held at eight operators. It had not: 11aa saw the same 1.8%
spread, and a 32-point check there found the 8-point rule converged, because
the two shifted 4-point grids err in opposite directions. I misread the log
when writing the prediction, and the committed text stays as it was.

**What a planner can take from it:** the 12- and 16-operator results now rest
on the simulator's expectation, not only on a formula fitted to it. The cheap
raster rule, four layer groups and re-planning rather than re-splitting are
all confirmed on these layouts. The open question is what extra layers cost.
The score so far charges nothing for climbing through occupied bands near
hubs, so it overstates what more layers buy.

Limits: 12 layouts, not the 48 of 11ac and 11ad; one city; straight legs, no
avoidance or wind; 2014 ride-hail pickups standing in for deliveries.
Results and code:
[`research/aerolog-scaling`](../../research/aerolog-scaling/), milestone 11ae.
