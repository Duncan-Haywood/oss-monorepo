---
title: "The trough that couldn't reach the hopper"
seo_title: "DIY tennis ball machine catch trough: gutter, sump and the lift"
date: 2026-11-13
tags: [open-tennis-robots, cad, hardware]
description: "Drawing the catch net's ball trough for the open tennis feeder showed balls end up 2.2 m below the hopper. The design note said they would roll in."
---

The open tennis-ball feeder catches returns in a 3 m net that slides sideways
to meet them. Since its first design note, the plan for the caught balls fit
in one sentence: the ball "drops into the sloped trough along the bottom of
the frame, and rolls into the hopper." This run drew the trough, and the
model shows the sentence can't be true.

## What got drawn

The trough is bought half-round rain gutter, 125 mm across: almost two ball
widths, so a ball sliding down the net's face lands inside. One 3.05 m
length cut in two makes both runs. Three pairs of printed hangers hold them.
Each hanger bolts into the front slots of the net beam (the aluminium
extrusion along the bottom of the net) and has a saddle cut at the gutter's
height at that spot. Each run falls 3 degrees toward the middle, 75 mm over
1.44 m. At the middle a printed sump holds both low ends. Balls drop off the
gutter ends onto a floor that falls 23 degrees toward the back, and out
through an outlet stub that passes under the net beam, 50 mm above the court.

The build's collision check passes with the new parts. The tests check that
the gutter sits in every saddle with less than 2 mm of gap and no overlap,
that the hangers reach both bolt slots, and that a ball-sized sphere passes
through the outlet stub.

## How fast a ball comes back

The gutter's rolling resistance is a guess (0.03) until someone tilts a
gutter with a ball in it. At that figure a ball from the far end takes 4.6
seconds to reach the sump and arrives at 0.63 m/s. Between 0.02 and 0.034 the
time runs from 3.8 to 5.1 seconds. Slow is fine, because the runs can hold 42
balls in a queue. What matters more is that a ball that stops partway can
start again. Tan 3° is 1.7 times the assumed resistance, and the check asks
for 1.5 times, so a gutter rougher than 0.035 fails the build.

## Where the loop stays open

The tub's lower rim is 2,265 mm above the court. A ball leaving the sump has
to climb 2,245 mm to get in. The tub sits that high for a reason: the feed
hose has to fall at least 30 degrees all the way down to the launcher head at
every tilt and turn. Earlier runs set the outlet height to the lowest value
that keeps that true. Limiting the head to 30 degrees nose-up would lower the
tub by only 125 mm, which still leaves a 2,120 mm climb.

No chute fixes that. The machine needs a ball lift. The power is trivial:
36 balls a minute through 2.2 m is 0.75 W before losses. The hard part is the
mechanism (a paddle belt, a rotating-disc elevator or an auger) and finding
room for it. It has to stay clear of the head as it swings through ±36
degrees, clear of the base's wheels, and take balls from a sump that sits
under the net beam. Until then the build's manifest prints "NOT CLOSED" on the
trough line, and the design note no longer says the balls roll in.

## What a builder can check now

- Tilt a gutter with a ball in it and read the angle at which a stopped ball
  starts rolling. That replaces the 0.03 guess.
- Drop balls down a slack net into the gutter and count how many bounce out.
  On a hard floor an ITF ball rebounds 53 to 58% of its drop height. The net
  and the gutter's walls should soak up most of that, but nobody has
  measured it.

The parts, the checks and the numbers are in the project's
[CAD notes](../../ventures/open-tennis-robots/cad/README.md) under "Catch
trough". Nothing here has been built.
