---
title: "The tennis lift's empty belt rings at the rate its flights pass, and no belt tension fixes that"
seo_title: "Timing belt span vibration vs cleat passing rate: a worked case"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, vibration]
description: "A string model of the tennis feeder's lift belt: the empty belt rings inside the flight-passing band, and the pluck figure was 24% high."
---

The open tennis-ball feeder lifts balls 2.36 m to its hopper on a cleated
AT5 belt. Earlier today the lift got a [tooth-jump check](2026-11-15-open-tennis-robots-bigger-pulley-jumps-sooner.md).
That check left one question open. Each strand of the belt is a 2.36 m
string under about 10 N, and things bump it at regular rates: a flight
(cleat) passes every 0.56 s, a pulley turns, and the teeth mesh. Does any of
those land on a strand's own sideways frequency?

## The model

Each strand is a tensioned beam pinned at the two pulleys, solved by finite
differences with a Sturm count (no numpy needed). It carries its own mass,
each flight's 5 g and, on the up strand, the balls. The tension climbs up
each strand with its weight, plus each loaded flight's pull. Across its width
the steel cords make the belt stiff in bending. Off its face it is close to a
pure string. The solver matches the closed forms for a string and a
beam-string to 0.2%.

## Three things it found

**The tension-setting figure was 24% high.** The build notes told a builder
to pluck a strand and count about 2.4 swings a second. That came from the
bare belt's mass. The 32 flights add 0.033 kg/m to the belt's 0.085, so the
real figure is **2.1 swings a second**. Tension a belt to 2.4 and you get
1.24 times the tension you wanted. The manifest and the part note now say 2.1.

**The labels on the two strands were swapped.** The drive pulley is at the
bottom. It pulls the down strand in and pays the up strand out, so while
running the down strand is the tight one. Three earlier notes said the
reverse. Every model was symmetric, so no number moved, but a builder
slackening "the down strand" for the bench test would have slackened the
wrong one.

**The empty belt rings inside the flight rate's band.** After each ball the
lift runs on empty for 16 s, so most of its running time both strands sit at
the set tension. Off their face they ring at 2.12, 4.24 and 6.36 Hz. The lift
runs at a fixed PWM duty, so its belt speed follows the battery: 0.91 times
nominal at the 24 V cut with a full belt, up to 1.23 times on the charger's
29.2 V. Over that range the flights pass at 1.62 to 2.19 Hz. The fundamental
is inside that band. Because the two rates are nearly the same, each higher
mode meets the matching harmonic too.

## Why tension can't fix it

The obvious fix is to tension the belt so its fundamental clears the band.
Sweeping the set tension from 0.6 to 2 times shows why that fails. Below 1.2
times, the fundamental is in the flight band. From 1.3 to 1.5 times, it clears
that band, but the 2nd mode lands in the 3rd harmonic's band. At 2 times, the
fundamental meets a pulley's turn. Only 1.2 times clears all three, and it
sits exactly on a band edge: a flight weighing 10 g instead of the assumed 5
would undo it.

What does work is holding the belt speed fixed. At nominal speed the bands
shrink to a 5% margin, and today's tension clears all three low modes. So the
next step is a duty of about min(1, V_ref / V_bus), set from the battery
reading the firmware already takes. That should suit the jam cutoff too. Its
comparator sees duty times current, and a stall's current scales with the bus
voltage, so the filtered stall current stays about constant. That has to be
checked against the cutoff's rules, not assumed.

## The stretch modes, with the balls where they ride

The earlier jam model lumped the belt into one mass, spreading the balls
round the whole loop. Putting the loop in as a bar, with the balls on the up
strand only, gives a first drive mode of **34 Hz with every flight loaded and
41 Hz with every other**, against the lumped 38 Hz. The next mode the pulley
feels is 98 to 131 Hz, not 78. Moving the balls onto one strand shifts the
first mode by under 1 Hz. The lumping was the bigger error, so the jam sweep
should be rerun on the distributed belt.

## What it doesn't know

None of this says how hard a flight actually bumps a strand. A coincidence
only matters if something drives it hard enough, and the belt's damping is
unmeasured. The cheap test is a phone video of the empty belt on a fully
charged pack. Everything is unbuilt and runs on assumed figures, and the
details are in the project's `cad/README.md` under "Lift strand modes". The
output is `eval/lift-strand-modes-2026-11-15.txt`.
