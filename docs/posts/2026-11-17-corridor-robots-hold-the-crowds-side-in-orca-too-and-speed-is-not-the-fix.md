---
title: "Corridor robots: holding the crowd's side wins in a third crowd model, and a faster robot is not the fix"
seo_title: "Corridor robots in ORCA: side-holding wins, robot speed doesn't"
date: 2026-11-17
tags: [research, robotics, pedestrian-dynamics, crowd-simulation, society-lanes, AMR]
description: "In ORCA crowds, robots that hold the crowd's side save people 1.1 to 4.1 s per walk over lateral-goal robots. Faster robots don't stop robots slowing people."
---

The [society-lanes](../../research/society-lanes/) programme asks which side a hospital or warehouse robot
should keep in a corridor it shares with people. This morning's step (6d) found that in the social-force
crowd model a robot that holds the side people walk on beats an identical robot that heads straight for a
side exit: people got tidier lanes and walks 1.8 to 3.6 s shorter. It left two questions open. Does that
hold in ORCA, the collision-avoidance planner many real robots run and the third crowd model that passed
the programme's held-out test? And in the collision-free speed model, where *any* robots slowed people,
was the robots' 1.2 m/s speed the reason?

This step answered both, with eight predictions written down before 3,040 simulated runs on 40 fresh
random seeds per cell. Three held and five were refuted.

## ORCA: the side still wins

ORCA's crowd keeps right almost perfectly at its fitted bias (99.9% of people on their right), so we first
ran a no-robot sweep on separate seeds, disclosed in the log, to find weaker settings. At 2% of the fitted
bias the crowd keeps 72% on its right, close to the 65 to 68% filmed on real city pavements.

At every setting from that street-like crowd to the fitted one, with robots as 20% or 30% of the agents:

- **Robots holding the crowd's side gave people 1.1 to 4.1 s shorter walks through the 8 m test section**
  than the same robots heading for a lateral exit, and 0.04 to 0.15 more lane order. Every 95% interval was
  clear of zero.
- The lateral-exit robot did the most harm in the street-like crowd: up to 5 s per person against the
  same crowd with no robots.

So "hold the crowd's side" is now clear of zero in all three models.

## But ORCA disagrees with social force on "robot or no robot"

Against a crowd with the same number of people and no robots, crowd-side robots in ORCA *slowed* people,
by 0.05 to 0.99 s (intervals above zero in 5 of 8 cells), and did not tidy lanes even in the street-like
crowd. Our guess that they would seed lanes there was refuted. That puts ORCA with collision-free speed and
leaves social force, where crowd-side robots made walks a little shorter, as the odd one out.

## Robot speed is not the fix

In collision-free speed, raising robot speed from 0.8 to 1.2 m/s halved the slow-down (1.08 to 0.51 s). But
at 1.6 and 2.0 m/s, at or above the simulated people's average free
walking speed of 1.34 m/s (Weidmann 1993), it stayed at 0.57 and
0.52 s. The speed cap does not explain it. Speed did change one thing: faster lateral-exit robots cost less,
so the side's advantage shrank from 0.70 s at 0.8 m/s to 0.12 s at 2.0 m/s. **The side matters most for
slow robots.**

## What it means for a fleet operator

Two findings now hold in all three models: the policies rank the same by close passes, and holding the
crowd's side beats going straight for your exit. Whether a well-behaved robot beats no robot at all depends on which
simulator you ask, so a digital twin's claim that "robots speed people up" should not be trusted on its own.
These are simulations. The robots are agents of each crowd model, people push them, and walls cost little.

Code, results and the full prediction log: [`research/society-lanes`](../../research/society-lanes/)
(`experiments/m6e_orca_speed.py`, `LOG.md`, milestone 6e).
