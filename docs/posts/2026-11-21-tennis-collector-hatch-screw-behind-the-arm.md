---
title: "Tennis collector: one hatch thumb screw sits behind the arm, and how far to turn the drum"
seo_title: "Tennis collector: every screw head checked for access"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "Every screw on the open ball collector is now checked for a clear path to its head at every hole, by step and when built. One thumb screw needed a rule."
---

The open tennis-ball collector's assembly guide is built from its CAD, and the
build already checked every bolted joint's length against the parts under the
screw. It did not check whether you could get a key to the head. It also
measured each joint at one hole only, so a screw that was fine on the left
side was taken to be fine on the right.

Today every collector joint lists all its holes and, where it is made on both
sides, its mirror. That comes to 76 holes, which matches the number of screws
the guide's steps hand out, and a test keeps the two equal. For each hole, the
build sweeps a cylinder the size of the head 60 mm back from where it seats,
about a hex key's reach, and checks it three ways.

## The parts it clamps, and the step it goes in

The first check came from the feeder: nothing the screw clamps may block its
own head. All 76 holes pass.

The second check is new. It asks what is already on the robot when the guide
reaches the screw's step. Two joints fail it as plain steps. Once the wheel is
on, it covers all four yoke-lift switch screws. Once the tray is mounted, the
base plate covers the four screws that hold the Pi's standoffs. The guide
already said to do both on the bench. Those joints are now marked as bench
joints and checked against their own step's parts only. A test takes the mark
off and checks that the build names the wheel and the base plate. If a future
edit drops "on the bench" from the guide, the build fails.

## The finished robot, and the hatch

The third check looks at the finished robot and reports rather than fails.
The guide now has a "Service access" table saying what to take off to reach a
hidden screw. The switch screws are behind the wheel, the standoff screws
behind the base plate, and one of each drum cover's six screws behind the
yoke arm.

That last one matters for the hatch, the cover you take off every time you
empty the drum. At the angle the CAD draws the drum, one of its six thumb
screws is behind the arm, and you can't get a finger and thumb to it. The drum
turns, though, so the build now turns it a degree at a time and checks a
20 mm finger-and-thumb path to all six screws, against everything that doesn't
turn with the drum:

- the arm hides one screw over 24 degrees of every 60;
- slot-down, the angle at which the hatch lifts off, is clear by 11 degrees one
  way and 24 the other, about 27 mm of rim travel;
- the build now fails if slot-down comes within 3 degrees of a hidden screw.
  A wider arm or a different bolt circle can no longer quietly put a thumb
  screw behind the arm at the emptying angle.

So the guide's "turn the drum slot-down, undo six thumb screws" is right as
written, and the build now proves it.

## What this does not check

The nuts on the through-bolts are held with a spanner, and a spanner's path is
not a cylinder on the screw's axis. That covers the clamp rings' nylocs inside
the drum and the pivot and axle nylocs. The check also ignores the swing a hex
key's L needs to turn, and the screwdriver for the switch screws, which is
longer than 60 mm. The 20 mm grip is an assumption. Nobody has built a
collector yet.

Code and the measurements: `ventures/open-tennis-robots/cad/README.md`,
"Head access on every collector joint".
