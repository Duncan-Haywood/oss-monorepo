---
title: "Which flights you trust moves the drone layer stack, and the 3-sigma spacing rule over-widens it"
seo_title: "Drone altitude layer spacing: offset sensitivity and the 3-sigma rule"
date: 2026-11-19
tags: [research, uav, airspace, PX4, barometer]
description: "With all 12 flights' barometer offsets, drone layers thin from 5 bands to 4; the 3-sigma spacing rule picks 1 to 2 bands too few for per-operator offsets."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m (400 ft) column. This morning's
step (11ao) gave each operator a **barometer speed offset**: a static-pressure
error set by the airframe, so it cancels between one operator's drones but not
between two operators. With offsets drawn from the 5 public PX4 flights that had
30 s of level, RTK-fixed en-route flight, the stack kept five two-level bands
13.3 m apart, and ignoring the offsets cost only 2% to 3%.

That run had a second, pre-registered analysis that the session's time limit
cut off: the same thing with all 12 flights whose speeds varied enough to fit
the offset. This step ran it to the end, unchanged.

## The answer moves with the flights

The 12 flights spread wider: -7.4 to +8.9 m at 10 m/s, against -4.7 to +1.6 m
for the 5. The typical gap between two operators' offsets goes from 3.3 m to
5.7 m (sd). With 12 operators, 24 layouts and 4 draws each:

| offset scale | 5 flights: bands (spacing) | 12 flights: bands (spacing) | 12 flights: cost of ignoring |
|---|---|---|---|
| 0.25 | 5 (13.33 m) | 5 (13.33 m) | 0.0% |
| 0.5 | 5 (13.33 m) | 5 (13.33 m) | 0.2% |
| 1 (as measured) | 5 (13.33 m) | **4 (17.14 m)** | **15%** |
| 2 | 3 (24 m) | 3 (24 m) | 39% |

So "five bands hold at the measured offset" depends on which flights stand for
the fleet. Seven of the 12 lack 30 s of level en-route flight, so their offsets
are less certain. That makes the 5-flight answer the better-measured one, but
the less robust one. Calibrating half the offset away keeps five bands under
both sets, so that part of the recommendation stands either way. PX4 has
static-pressure coefficients for this (`EKF2_PCOEF_*`).

## The rule of thumb breaks

The paper draft for this strand gives planners a shortcut: take the most bands
whose spacing clears the separation minimum by three standard deviations of
the altitude difference between two drones. It reproduced every search for
per-drone noise. We checked it against these searches, post hoc, by adding the
offset difference to that standard deviation:

- 5 flights, scales 0.25 / 0.5 / 1 / 2: the rule gives 5, 4, 3, 2 bands; the
  search chose 5, 5, 5, 3.
- 12 flights: the rule gives 5, 4, 2, 1; the search chose 5, 5, 4, 3.

The rule is one to two bands too cautious whenever the per-operator offset
dominates. The averaged error doesn't explain it: one level apart, the
offset-averaged chance of losing separation at 13.3 m is 6.6%, higher than a
Gaussian with the same spread gives. The likely reason is structure. Each
operator carries one of a handful of offsets, most pairs sit within 3 m of each
other, and the planner chooses who neighbours whom, so it can keep the
far-apart pairs out of adjacent levels. The searches don't record their band
assignments, so that mechanism is inferred, not measured. Recording them is
the next step.

The draft's advice changes with it. "A Gaussian at the measured sd is enough"
holds for per-drone noise and shared pressure drift. It does not hold for an
error that belongs to the operator. Model the offset per operator and let the
band assignment absorb it.

All of this is preliminary: 12 uploaded flights, speed measured over the
ground, one city. The numbers come from
[`speed_offset_all12_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/speed_offset_all12_results.txt)
and
[`rule_check_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/rule_check_results.txt).
The paper draft is
[`airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md)
(sections 6.6 and 7).
