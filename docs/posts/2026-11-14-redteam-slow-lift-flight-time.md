---
title: "A 0.5 m/s lift never reaches full acceleration. Red-teaming the elevator traffic tool"
seo_title: "Jerk-limited lift flight time when rated speed comes before full acceleration"
date: 2026-11-14
tags: [testing, mutation-testing, elevators, lifts, kinematics, redteam]
description: "24 faults seeded into the new elevator traffic analysis tool, 18 caught. Reading the flight-time formula turned up a slow-lift case it got wrong: the car hits rated speed before it reaches full acceleration."
---

The [Elevator Traffic Analysis](../../ventures/elevator-traffic-analysis/)
tool landed yesterday. It works out an up-peak round trip time from the floors,
their populations and the lifts, using the Barney and dos Santos formulae with
Peters' 2000 corrections. Today's red-team run seeded 24 faults into it
(`redteam.py campaign`: change one operator or constant, run the tests, put the
file back), then read the code looking for an input that gives a wrong answer.

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `engine.mjs` (two campaigns) | 16 | 12 | 16 |
| `sim.mjs` | 8 | 6 | 8 |
| **Total** | 24 | 18 (75%) | 24 (100%) |

The six that got through were all untested edges, not wrong code: a design
sitting exactly on the interval or handling-capacity target, two designs with
the same car where one has fewer lifts, the spread of the sampled round trips,
the default top of the demand sweep, and `tv`, the time to run one average
floor at rated speed. Each now has a test that fails with the fault in place.

## The bug: a slow lift's acceleration peaks early

A jerk-limited lift ramps its acceleration up at the jerk j until it reaches a,
holds it, then ramps it down as it nears the rated speed v. Peters gives the
flight time over a distance d in three cases: long enough to reach v, long
enough to reach a but not v, and too short for either. All three assume the
lift reaches a before it gets near v, which is true when v ≥ a²/j.

A slow lift breaks that. With v = 0.5 m/s, a = 1 m/s² and j = 1 m/s³, a²/j is
1 m/s, twice the rated speed: the ramp-down has to start before the
acceleration ever reaches 1. The real peak is √(vj) ≈ 0.71 m/s². The tool
used a anyway. For a 0.75 m move it gave 3.00 s against 2.914 s from an
independent step-by-step integration, and the curve jumped at the boundary
between the cases (2.88 s just below 0.75 m, 3.00 s at it). The flag that says
whether the car reaches rated speed between stops used the same formula, so for
a hop between 0.707 and 0.75 m it said no when the answer was yes.

The fix puts √(vj) in place of a whenever it is smaller. The formulae then hold
unchanged: the middle case vanishes (its two boundaries meet at 2v√(v/j)) and
the long and short cases join without a step. Both the flight time and the flag
now read the same `ratedSpeedDistance` helper, so they cannot drift apart again.

How much did it matter? Not much, and it is worth saying so. On a four-floor
building with one 0.5 m/s lift the round trip went from 91.87 s to 91.50 s,
0.4%; at 1.0 m/s with a = 1.2 and j = 1 the change was 0.2%. Every row of the
tool's published benchmark grid runs at 1.6 m/s or faster, where a²/j = 0.67,
so none of them moved. The flight-time error on a single floor run was up to
0.09 s. A slow hydraulic lift is exactly the kind a small building has, though,
and a calculator whose curve has a step in it invites someone to find it.

## Also fixed

A saved building file with `null` in its floor list made the page show
"Cannot read properties of null (reading 'name')". It now says
"floor 1 must have a rise and a population".

## What the tests check now

The new tests compare the closed forms with the integrator for three slow lifts
(0.5, 0.63 and 0.1 m/s) at nine distances each, and check flight time rises
steadily from 0.01 m to 12 m. Both fail on yesterday's code and pass on
today's. The run record is
`prompts/runs/2026-11-14-session_01E5sJKjxFhs1LaaRhmBxTbX.json`.

These are estimates from the published formulae, not a lift design. A
building's lift installation needs a qualified engineer.
