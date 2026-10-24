---
title: "Robot assembly in simulation: what 49 digital-twin studies found"
date: 2026-10-20
description: "Assembly order planning, peg-in-hole transfer, digital twins that check robot programs, and robot-printer cell bottlenecks: findings from 49 simulated studies."
tags: [research, robotics, simulation, digital-twin, manufacturing]
---

# Robot assembly in simulation: what 49 digital-twin studies found

One research track in this repository is general-purpose robot manufacturing
loops. Its brief in [`research/PROJECTS.md`](../../research/PROJECTS.md) lists
the milestones: plan the assembly order of a small printed product, learn
peg-in-hole insertion and measure how it transfers between simulators, check
robot programs in a digital twin before they run, model a cell of an arm,
printers and an inspection station, and have an arm assemble part of its own
gripper.

All of those exist, among 49 `research/robofab-*` projects
(`ls -d research/robofab-*`). Most of the rest are follow-ups that test one
earlier result. AI coding agents did the work, with the repository's owner
steering. Every number below is copied from the README linked next to it.

The caveats first. Everything is simulated, and nearly everything is
stylised: the products are boxes, the times and failure rates are
illustrative values chosen by the agent, and no arm or printer was touched.
The track's recurring theme is fidelity: what a cheaper checker gets wrong
compared with a better one. That is a sim-to-sim question, not sim-to-real.
None of this is engineering advice.

## 1. Gravity removes 99% of the collision-free assembly orders

[`research/robofab-sequence/`](../../research/robofab-sequence/) counted every
order in which a twelve-part printed gearbox can be assembled one part at a
time. Of the 11! = 39,916,800 orderings of the non-base parts, 4,227,168
(10.6%) pass a collision-only check, and 30,760 (0.077%) also pass a
quasi-static support check. The order that is best under the collision-only
check is invalid once gravity counts: it places a collar before the shaft it
rests on.

[`research/robofab-settle/`](../../research/robofab-settle/) then dropped all
2,048 partial assemblies into the MuJoCo physics engine. The hand-written
support rule agreed on 1,957 of them (95.6%). The 81 states it accepted but
MuJoCo toppled came from a bug the comparison exposed: a part could count as
resting on a part that rests on it. An acyclic version of the rule removed all
81. The count of valid complete orders did not change, 30,760 under every
checker, because none of the disagreeing states lie on a complete order.
That is a result about one product, not a guarantee.

## 2. An insertion policy tuned in a simple simulator loses most of its success in a harder one

[`research/robofab-insert/`](../../research/robofab-insert/) tuned a
five-parameter peg-in-hole search policy in MuJoCo at several fidelity levels
and tested each on all of them, plus a held-out level. Tuned on the simplest
level (no friction, soft contacts), it succeeded on 0.91 of test cases there,
0.53 on the stiffer, higher-friction level and 0.26 on the held-out one.
Domain randomisation reached 0.43 on the held-out level, against 0.46 for
training on the harder level directly. With five seeds and overlapping ranges,
the study cannot rank those two. No policy solved the held-out level: the best
seed reached 0.61.

## 3. A twin catches the errors it models and misses the ones it does not

[`research/robofab-program/`](../../research/robofab-program/) checked
pick-and-place programs at three twin fidelities against a held-out reference
twin standing in for "what really happens". Of 162 single-edit mutants of
working programs, 69 fail the reference. The geometry-only level caught 38 of
them (0.55), adding joint and payload limits caught 46 (0.67), and adding
stochastic grasp error and grip build-up time caught 60 (0.87). No level
raised a false alarm. The nine that slipped through were small place offsets
and grip waits a few hundredths of a second short.

The eight programs themselves were written by the agent session that built
the twin, and three of four first drafts failed the reference. The README
says that is not a measure of how often a language model errs, since the
author knew the checks, and no language-model API was called.

## 4. In a robot-printer cell, utilisation names the wrong bottleneck

[`research/robofab-cell/`](../../research/robofab-cell/) built a
discrete-event twin of one arm loading and unloading 3D printers, with an
inspection station. The printers showed the highest utilisation at every
size, and the arm sat lower (0.47 against 0.71 at eight printers). Yet at six
printers, halving the arm's load and unload time saved 21.1 minutes of a
338-minute batch, and a second arm saved 10.9. A printer is held while it waits for the arm, so
arm delay shows up as printer idle time. A deterministic twin using mean print
times underestimated the stochastic makespan by 133 minutes at one printer.

[`research/robofab-cell-mva/`](../../research/robofab-cell-mva/) compared exact
queueing analysis with the simulation. With the cell's real printer-holding
behaviour, a simple utilisation bound overestimated throughput by 10.9% to
17.4% at four to eight printers. Mean value analysis did better in most rows
but kept rising at high work in process where the simulation plateaued, 14%
too high at eight printers.

## 5. A print-failure camera pays only while printers are the limit

[`research/robofab-cell-monitor/`](../../research/robofab-cell-monitor/) added
mid-print failures at 0.3 per printing hour and a camera that aborts a failing
print 10 minutes later. The simulated gain was 8.4% in good parts per hour at
six printers and 0.8% at sixteen, where the arm limits the cell. False stops
erase the gain somewhere between 0.1 and 0.2 a printing hour (about 0.16 by
interpolation); at 0.8 the cell made 28% fewer parts than printing blind.

## 6. A gripper cannot build a same-size copy of itself

[`research/robofab-selfparts/`](../../research/robofab-selfparts/) found that a
parallel-jaw arm needs a jaw opening of at least 30 mm, the width of the
widest part, to assemble its seven-part toy gripper.
[`research/robofab-bootstrap/`](../../research/robofab-bootstrap/) made the
arm the previous printed gripper. With 4 mm pads, the unit gripper offers
24 mm of opening and needs 30, so a same-size copy cannot be built.
Self-assembly starts at a scale equal to the pad thickness in millimetres, a
closed form that the search confirms. Purchased seeds of 60 and 100 mm built
smaller grippers until the chain died; seeds of 130 and 140 mm reached a
design that reproduces indefinitely. The pad and stroke figures are
assumptions of the study.

## 7. Worst-case tolerance stacking asks for about three times the clearance

[`research/robofab-tolstack/`](../../research/robofab-tolstack/) asked how
much clearance a printed two-pin cover needs to assemble. The textbook
plus-or-minus three sigma worst-case stack prescribed 3.0 to 3.4 times the
clearance needed for 99% yield. Position error, not hole size error, set the
requirement. A three-sigma root-sum-square rule came close to a 99.9% design
when the holes were unbiased.

## 8. A cross-check that the dynamics are not a bug

Several projects found a time-optimal carry 9 to 23% faster than a tuned
trapezoid profile, all resting on one hand-written torque equation.
[`research/robofab-mujocotorque/`](../../research/robofab-mujocotorque/)
rebuilt the arm in MuJoCo: across 108 profiles the two disagree by at most
1.8e-5 N m against a 5 N m limit. That rules out a dynamics bug in the toy
model. It does not validate the toy against a physical arm.

## What is missing

The track's last milestone is an owner step: test the best simulated result
on a low-cost open arm such as the SO-101, with a priced parts list. Until then,
the most transferable results here are the methodological ones: count
exactly when you can, check the cheap model against a better one, and expect
the twin to miss whatever it does not model.

Companion roundups cover the
[ambient AI assistant track](2026-10-20-ambient-ai-assistant-when-to-speak-research.md)
and [self-replicating manufacturing](2026-10-20-self-replicating-3d-printer-reprap-closure-research.md).
