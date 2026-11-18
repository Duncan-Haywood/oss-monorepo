---
title: "Three crowd simulators agree on which robot passes people too closely, not on what it costs them in time"
seo_title: "Robot passing policy in crowd simulators: what carries over"
date: 2026-11-16
tags: [research, robotics, pedestrian-dynamics, crowd-simulation, society-lanes, orca]
description: "ORCA, social force and a collision-free speed model rank four robot passing policies identically by close passes, and differently by human delay."
---

Earlier today the [society-lanes](../../research/society-lanes/) programme put robots into three
crowd simulators built on JuPedSim and found one point of agreement: a robot that keeps to the side
opposite the people's keep-right convention is the worst choice. On the other three policies the
simulators disagreed. This step adds the two crowd models from other code bases. One is ORCA, the
collision-avoidance method many real robots run. The other is the anticipatory power law fitted to
pedestrian data. With all five in, there is a sharper answer.

## Why ORCA matters here

Earlier milestones tested five crowd models against real corridor experiments. Three of them,
social force, the collision-free speed model and ORCA, predicted how far people drop the keep-right
habit once they head for a side exit (within 0.10 of the measured 0.54). Those three are the ones
whose policy advice should count. In this run ORCA also drove the robots, so robot and crowd used
one planner, as a fleet running ORCA would.

The robots were 5, 10 or 20% of the walkers, at 1.2 m/s (a rated speed of the MiR250 robot), in
two runs of the 3.6 m HERMES corridor. They followed four policies: keep the crowd's side, keep the
opposite side, adapt to the local majority, or head for a side exit. The run had 1,360 simulations
with 20 seeds per cell, and eight predictions were committed before it started.

## What carries over

Ranked by **close passes**, the share of robot-person passes with less than 0.5 m between bodies,
the three trusted models agree exactly at every robot share: crowd's side, then adapt, then lateral
goal, then opposite. Kendall τ is 1.00 in all nine comparisons.

| 20% robots | crowd's side | adapt | lateral goal | opposite |
|---|---|---|---|---|
| Collision-free speed | 0.03 | 0.05 | 0.22 | 0.63 |
| Social force | 0.08 | 0.16 | 0.37 | 0.58 |
| ORCA | 0.02 | 0.09 | 0.46 | 0.74 |
| Power law | 0.04 | 0.06 | 0.21 | 0.45 |

Ranked by **human delay per robot pass**, the same three models disagree: τ runs from 0.00 to 1.00,
and only one of nine comparisons reaches 0.8. This session also built an earlier, independent
version of the JuPedSim run, with different code and a slower robot, and found the same split.
Rankings by lane damage agreed there, and rankings by delay did not.

## Other results

- Opposite-side robots cost people about 2.3 s (ORCA) and 2.2 s (power law) per 8 m walk at 20%
  robots. Crowd-side robots cost 0.01 and 0.04 s.
- ORCA's lanes barely notice robots in the wrong lane (lane order drops by only 0.06). That matches
  the anticipation model in the earlier run: crowds that form strong lanes on their own absorb a few
  contraflow robots.
- Where the models part is the robot bound for a side door. It costs people 1.7 s per walk in the
  power law and 1.9 s in social force, but nothing measurable in the collision-free speed and
  anticipation models. ORCA sits between, at 0.9 s.

## What it means

For a fleet engineer, the advice to keep to the crowd's side survives every simulator tried. So does
the ranking of policies by how often the robot comes too close to people. A figure for how many
seconds a policy costs people does not survive a change of simulator, so quote it with the model
named. For the programme, the test of whether policy rankings carry over between models (H5) can now
be registered on close passes, with this run as its preview.

Limits: none of the five models reproduces the real runs' side share, lanes and speed-density at
once. The robots are agents of each crowd model, so people push them as they push each other, and a
real robot does not yield to contact. Everything here is simulation; a trial with a robot and people
needs ethics review and is the owner's step.

Code, data and the log: [research/society-lanes](../../research/society-lanes/)
([LOG.md](../../research/society-lanes/LOG.md), milestone 5b).
