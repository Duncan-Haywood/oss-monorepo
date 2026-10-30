---
title: "Can a Unitree humanoid carry building materials? A MuJoCo payload study"
seo_title: "Can a Unitree humanoid carry building materials?"
date: 2026-10-21
description: "MuJoCo payload limits of the Unitree G1 and H1 against house-building tasks: what a stock humanoid can lift on site today, and which motor gives out first."
tags: [research, robotics, humanoid, construction, mujoco, housing]
---

# Can a Unitree humanoid carry building materials?

Labour is a large part of what a new house costs. Humanoid robots like Unitree's G1
and H1 are now on sale to anyone. So it is fair to ask whether one could do
useful work on a residential building site, perhaps beside a crew. Before
anyone trains a robot to frame a wall or hang drywall, there is a plainer
question. Can it even hold the materials?

This repository opened a long-term research track on that question,
[robots on the residential building site](../../research/PROJECTS.md) (track
20). Its first project, [`buildbot-payload`](../../research/buildbot-payload/),
gives a first answer in simulation.

## What was measured

The project loads the open MuJoCo Menagerie models of the G1 and H1. For each
hand position, from 0.2 to 2.0 m high and 0.2 to 0.6 m in front of the feet,
it finds the heaviest load the robot can hold in both hands while standing
still. The feet stay flat. The robot leans back so that it and the load
balance over its feet. Every joint must stay inside the torque limit the
model lists. A test checks the solution against MuJoCo's own forward
dynamics: with the computed torques applied, nothing accelerates.

## What it found

- **The G1 (33 kg) holds about 4.5 kg.** It manages 1.5 to 4.7 kg with its
  hands 0.4 to 0.5 m out, and up to 12 kg held close. Unitree rates the G1's
  arm at 2 kg (3 kg for the EDU) and notes that the figure depends on posture,
  so the simulation and the vendor broadly agree. What gives out is not the
  arm but the **waist pitch motor** (50 N·m), in 16 of the 28 reachable
  positions.
- **The H1 (51 kg) holds about 14 kg**, 12 to 15 kg over most of its reach,
  and its **18 N·m elbows** are the limit.
- **On real tasks.** The G1 can carry an 8 ft 2x4 or hold a framing nailer,
  but not a 2x6. The H1 can carry studs and take one end of a 4x8 sheet of OSB
  or drywall while a person takes the other, and it can set a lightweight
  concrete block. Neither can carry a whole sheet alone, set a normal-weight
  block or lift a 60 lb bag, and neither reaches an 8 ft ceiling. The task
  masses come from maker and standards data: USG for drywall, the NDS for
  lumber, a masonry survey for blocks, and a nailer's listing.

So a stock humanoid today is a helper for light handling and a second pair
of hands on a shared sheet. The person's half of that sheet, 10 to 12 kg, is
well under the NIOSH lifting guideline. Heavy pieces still go to people,
lifts and cranes.

## How far to trust it

These are static limits at each model's peak torque. A robot holding a load
for minutes runs nearer its continuous rating and will manage less. Walking,
gusts on a sheet, grip and the robot's hands (the G1's have no fingers, and
the H1 has none at all) are not modelled. The Menagerie models are the
community's approximations of the robots, and nothing was tested on
hardware. The pose solver also picks a posture near the robot's home pose
rather than its strongest one, so some limits, particularly the waist, may
be pessimistic.

## What comes next

The track's plan, in [`research/PROJECTS.md`](../../research/PROJECTS.md),
goes from here to dynamic carrying over site terrain, fastening, a person and
a robot holding one sheet together under contact-force limits, and a
published library of trained skills. It then turns to a purpose-built
machine for whichever task holds the most labour cost, and finally to what
all of it would take off a house's price. This first result already points
the purpose-built branch somewhere specific: stronger waist and elbow
motors.

The research was done by an AI coding agent (Claude) in one session, with the
code, tests and data in the repository.
