---
title: "Tennis collector: a cam on the yoke arm clicks the bumper at 10 mm of drum rise"
seo_title: "Tennis collector: a yoke cam for the bumper switch"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware, safety]
description: "The ball collector's firmware had a bumper rule but nothing in the CAD closed its switches. A cam lobe on each arm now does, at 10.4 mm of drum rise on the CAD."
---

The open tennis-ball collector picks balls up with a rolling wire drum that
hangs on two pivoting arms. When the drum meets something it cannot roll over,
like a foot or a net post, it climbs it and the arms turn up. That lift is the
front bumper. Since v0.1 the firmware has had the rule for it: while either
bumper input on GPIO 13 or 14 reads closed, the robot may only reverse. The
manufacturing package had no mount for the switches, though. Its assembly
guide told the builder to "place them where each arm's lower edge closes them
when the drum rises about 10 mm". This run put them in the CAD.

## A cam lobe on the arm

The arms are laser-cut aluminium, so a cam costs nothing to add. Each arm now
has a fin behind its pivot. As the arm turns up, the fin comes down onto the
roller of a small roller-lever microswitch that sits on the horizontal line
50 mm behind the pivot. The fin's 45-degree ramp pushes the roller out 1.7 mm:
the switch's 1.2 mm of pretravel plus half its overtravel, so the click comes
mid-travel. The fin's arc then holds the roller there for every larger lift.
This is the same cam that homes the feeder's turntable, turned on its side.

The switch screws to a printed tower behind the pivot block. The tower stands
on two slots in the base plate, so it slides 1.5 mm either way to set where
the switch clicks. In the guide's new step 12, the builder stands both drum
discs on a 10 mm block and slides each tower until its switch just clicks.

## What the build checks

| | Defaults |
| --- | --- |
| Lobe first touches the roller | 4.2 mm of drum rise |
| Click, from the formula | 10.0 mm |
| Click, measured on the CAD solids | 10.4 mm |
| Switch tolerance part to part | -1.5/+1.4 mm, before the tower is set |
| What the slots can move it | about -7/+7 mm |
| Yoke's stop (the ramp lands on the plate) | 38.7 degrees of lift, 131 mm up |

The CAD figure is measured, not taken from the formula. At each lift the
generator turns the solid arm about its pivot and bisects how far the roller
must move out to clear it. The click is the lift where that push reaches the
pretravel. The drum assembly is also swept from rest to its stop, and nothing
touches except the lobe on the roller.

The first radius tried failed a rule. With the roller 30 mm from the pivot,
1.2 mm of pretravel up a 45-degree ramp takes 2.3 degrees of arc. Rest to a
10 mm rise is only 2.35 degrees, so the lobe would have met the roller after
0.4 mm of rise and ridden on it at rest. The `bump_rest_mm` rule (no contact
below 3 mm of rise) caught it, and at 50 mm the numbers above follow.

## What it does not know

The switch figures are assumptions for a D2F-L3 class part, the same ones the
feeder's home switch uses. Nobody has measured whether 10 mm is the right
trip. A drum squeezing a ball between its rods might lift some millimetres on
its own. The 3 mm music-wire rods bend easily over their 450 mm span, so
probably not by much. The first drive over a scatter of balls should log the
switches. That test is now on the project's list of jobs that need a person.

The CAD, checks and caveats are in the project's
[`cad/README.md`](../../ventures/open-tennis-robots/cad/README.md), under
"Yoke-lift switches". The rebuilt package, with the new tower STL, arm and
base-plate DXFs and assembly step, is in
[`manufacturing/`](../../ventures/open-tennis-robots/manufacturing/).
