---
title: "A corridor robot that holds the crowd's side saves each person 1.8 to 3.6 s over one that doesn't"
seo_title: "Corridor robots: holding the crowd's side vs extra bodies"
date: 2026-11-17
tags: [research, robotics, pedestrian-dynamics, crowd-simulation, society-lanes, AMR]
description: "A registered crowd-simulation test separates a robot's side from its body: holding the crowd's side gives tidier lanes and seconds shorter walks."
---

The [society-lanes](../../research/society-lanes/) programme asks which side a hospital or warehouse
robot should keep in a corridor it shares with people. Earlier milestones settled one thing: a robot that
keeps the side people *don't* use is the worst choice in every crowd model we fitted. Yesterday's step
(6c) then found that an apparent speed-up from robots holding the crowd's side was mostly the crowd being
thinner, not the robots seeding lanes. It also noticed, after the run, a small gain in lane order. A
number noticed after a run proves nothing until it is tested.

So today's step tested it, with predictions written down before the run, 40 fresh random seeds per cell
and 2,800 simulated runs. It also fixed a flaw in yesterday's control. "Fewer people, no robots" differs
from "fewer people plus robots" in two ways: the robots hold a side, and they are extra bodies in the
corridor. The new arm uses the same robots, at the same speed, but sends each one to a lateral exit drawn at
random, as a delivery robot would go where its job sends it. Comparing the two robot arms isolates the side.

## What came out

In the social-force crowd (JuPedSim, fitted to the Jülich corridor experiments), with robots as 20% or 30%
of the agents and people's keep-right habit weakened to a quarter, a half or three quarters of the fitted
value (the street is weaker than the lab):

- **The side is what matters.** Robots holding the crowd's side gave people 0.12 to 0.21 more lane order
  and **1.8 to 3.6 s shorter walks through the 8 m test section** than the same robots heading for a
  lateral exit. Every 95% interval was clear of zero.
- **Bodies alone hurt.** Lateral-exit robots cost people 1.7 to 2.9 s per transit against having no robots.
- **The lane gain is real but small.** Against no robots, crowd-side robots raised lane order by 0.04 to
  0.07 in all six cells, smaller than the after-the-fact 0.08 that prompted the test.
- **A small speed-up shows on more seeds.** Crowd-side robots shortened people's walks by 0.07 to 0.69 s
  against no robots, with intervals below zero in three of six cells. Yesterday's 20 seeds were too few to
  see it.

The second family, JuPedSim's collision-free speed model, agreed on the main point (side-holding beats the
lateral exit by 0.3 to 0.7 s) but not on the rest. There, *any* robots slowed people against no robots,
crowd-side ones by 0.5 to 0.9 s, and lanes did not get tidier because they were near perfect already.
That is the same split the programme has seen since milestone 5b: models agree on how policies rank by
close passes and on big contrasts, and disagree on small delay effects.

Of seven predictions, four held and three were refuted, among them our guess that the collision-free speed
crowd would barely move at a quarter of its keep-right bias. It moved from 0.94 to 0.77 on its right.

## What it means for a fleet operator

The question is rarely "robot or no robot". It is what the robot does once it is there. In both models a
robot that holds the side people walk on costs them less than one that goes straight for its exit, and in
one model it beats having no robot at all. These are simulations: the robots are agents of each crowd model,
people push them, and walls cost little. Next is the same test in ORCA, the third model that passed the
programme's held-out test, and a robot-speed sweep to see why collision-free speed robots slow people.

Code, results and the full prediction log: [`research/society-lanes`](../../research/society-lanes/)
(`experiments/m6d_lane_test.py`, `LOG.md`, milestone 6d).
