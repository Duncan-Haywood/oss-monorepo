---
title: "The robots that seemed to speed up a crowd were mostly just making room"
seo_title: "Do robots seed pedestrian lanes? A density-matched control says no"
date: 2026-11-16
tags: [research, robotics, pedestrian-dynamics, crowd-simulation, society-lanes, social-navigation]
description: "Crowd-side robots appeared to cut walkers' transit by 1.6 s. With a control that keeps the people count but drops the robots, 88% of the cut is density."
---

The last step of the [society-lanes](../../research/society-lanes/) programme found something it
had not been looking for. In a simulated corridor where people's keep-right habit was weakened,
robots that held the crowd's side seemed to make people walk faster: 1.6 s off each person's trip
through an 8 m section, with people's lanes looking tidier too. If robots can act as lane seeds,
that is a reason to deploy them beyond "they brush past fewer people".

That reading had an obvious problem. In those runs a robot *replaced* a person, so a corridor with
20% robots also held 20% fewer people. Fewer people walk faster. So this step registered six
predictions and ran a control that only takes the people out: the same number of people as the
robot runs, and no robots.

## What was run

The social-force crowd model in JuPedSim, fitted earlier to real Jülich corridor experiments, in
two of those corridors (30 and 60 agents). Four conditions: the full crowd, the thinned crowd
(the control), the thinned crowd plus robots on the crowd's side, and plus robots on the other
side. Robots at 10% and 20% of the agents. The keep-right bias was swept from a quarter of its
fitted value to the full value. Twenty fresh random seeds per cell, 1,120 runs, intervals from a
bootstrap over seeds.

## What happened

At half the bias with 20% robots, the setting of the original hint:

| Change in people's transit | Seconds | 95% interval |
|---|---|---|
| Robots + fewer people (total) | &minus;0.91 | [&minus;1.58, &minus;0.11] |
| Fewer people alone (density) | &minus;0.80 | [&minus;1.37, &minus;0.26] |
| Robots beyond the control (seeding) | &minus;0.11 | [&minus;0.74, +0.66] |

Density accounts for 88% of the speed-up. In none of the eight bias and share settings did
crowd-side robots shorten people's trips beyond the control with an interval clear of zero. The
earlier 1.6 s was itself one draw of 20 seeds; this draw gave 0.9 s at the same setting.

Two predictions held. Robots on the wrong side slow people by 1.2 to 4.3 s against the same
control in every setting. And at a quarter of the fitted bias the crowd kept right 68% of the time,
the first simulated crowd in the programme to sit at the value measured on real city pavements
(65% in Zurich, 68% in Nicosia).

One thing showed up that was not registered: at 20% robots, crowd-side robots did raise people's
lane order a little beyond the control (+0.08 at a quarter of the bias, +0.055 at three
quarters). Tidier lanes, then, but not faster walking. That needs its own registered test before it
counts.

## What it means

A fleet operator choosing a passing policy still has the reason from the last step: holding the
crowd's side gives the fewest close passes, and three different crowd models agree on that
ranking. "Robots make the crowd faster" is not a reason; it was the crowd getting thinner. The
caveats stay: one crowd model family, simulated people, robots that people can push.

Code, results and the registered predictions:
[`research/society-lanes`](../../research/society-lanes/) (`experiments/m6c_lane_seeds.py`,
`LOG.md`).
