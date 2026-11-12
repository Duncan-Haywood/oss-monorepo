---
title: "A hard stop is only a stop if nothing hits first"
seo_title: "DIY tennis ball machine turntable hard stops: sizing the pad and clearing the frame"
date: 2026-11-12
tags: [open-tennis-robots, cad, hardware]
description: "Adding end stops to the tennis feeder's turntable showed the head would hit the hopper posts 4 degrees before reaching them. Two sets of posts moved out."
---

The open tennis-ball feeder turns its launcher head ±30 degrees on a turntable.
A stepper drives it through a 15-tooth pinion and a printed gear sector, and a
switch homes it at -32 degrees. Nothing stopped the head beyond that. Turn it
by hand, or let the stepper lose steps and run on at full speed, and the pinion
walks off the end of the sector at about ±37.5 degrees. After that the motor
cannot drive the head back. The roadmap's line for this was "a hard stop past
the gear sector's ends". This run drew one, and found that the stop alone was
not enough.

## Where the stop goes

The gear sector turns in a 10 mm gap between the mast plate and the turntable
plate. Two printed blocks now sit in that gap on the mast plate, one each side,
95 to 109 mm from the axis. Each has a 5 mm polyurethane pad glued to its face.
The sector's own end faces hit the pads, so the stop adds no part that turns.

The stop angle has to fit between four limits:

| Limit | Angle |
| --- | --- |
| Working range | ±30 deg, plus 2 deg of margin |
| Home click, with the switch bracket's whole slot adjustment (0.94 deg) and 0.5 deg more | at least 33.4 deg |
| One full tooth pitch of mesh left past the pinion, so the pinion is fully engaged when it stalls | at most 36.0 deg |
| Where the pinion runs off | 39.9 deg |

The last two rows are for a sector 4 degrees longer than before. With the old
8 degrees of spare teeth at each end, full mesh ran out at 33.6 degrees. That
left a 0.2-degree window above the home limit, too small to build to. The spare
teeth are now 10 degrees, and the stops sit at ±35.

## What a stop has to take

The firmware clamps every target to ±30 degrees, so the stepper is never told
to go to a stop. The design case is a runaway: lost steps at the top speed of
60 deg/s. The turning parts measure 0.35 kg m² from the CAD. With the rotor and
pinion reflected through the 10:1 ratio, a runaway carries 0.19 J into the pad.
Treat the pad as a linear spring, stiffness = modulus × area / thickness. With
an assumed 5.5 MPa for Shore 70A polyurethane, a 12 × 6 mm pad 5 mm thick
squeezes 2.2 mm (44%). That gives 174 N, plus 36 N from the stepper still
pushing at its holding torque. A 4 mm pad would squeeze 49%, with no margin
left on the 50% counted on.

That force lands on the sector, which is held to the turntable by three M4
heat-set inserts. The worst insert takes 115 N, from the direct share plus the
moment about the three inserts, against an assumed 300 N. Stalled against a
stop, the printed teeth bend at 6.0 MPa against the 10 MPa allowance used for
the drive. The pad absorbs up to 68 deg/s within 50%. A harder shove by hand
than that goes into the PETG block.

## The stop is not the first thing hit

The collision sweep had only ever turned the head to ±30 degrees. Turned to the
stop, and on to 36.4 degrees with the pad squeezed to its limit, it showed the
stops were not the first contact:

| Head nose-up | First thing hit, and where |
| --- | --- |
| 25 to 45 deg | the hopper's front posts, at 31.6 deg |
| 45 deg | the mast plate's rear notch, at 31.8 deg (once the posts moved) |
| 45 deg | a rear mast post, at 32.3 deg (once the notch widened) |

All three came 3 to 5 degrees before the pads. So the head's launcher plates
would have hit an aluminium post, not the polyurethane. The hopper posts moved
out from y ±245 to ±290 mm (the rear pair moves with them). The mast posts slide along their rails from ±130 to
±160 mm. The mast plate's notch is now sized to the reach angle, not to ±30.
Bisection then puts the first contact anywhere at 37.3 degrees, at every
elevation from -15 to +45. That is 0.9 degrees past the reach. The wider shelf
still passes the bracing check: 185 N and 179 N in the braces, against 1.62 and
1.38 kN to buckle them.

The build now sweeps the turned head at ±36.4 degrees at three elevations.
There the only contacts it allows are the sector against its pads and the home
switch's lever, which is drawn in its free position. A test pushes the drawn
sector into the drawn pads. They are clear at 34.95 degrees and touching at
35.05 degrees. At the reach, the sector still does not touch the block behind
the pad.

## A small bug the stop found

The first contact test failed on one side only. The sector's low end was not a
radial face. Its inner corner stopped 3.3 degrees short of the outer corner,
because the outline generator rebuilt the end angle as `a1 + (a0 - a1) * 24 / 24`.
That can round just below `a0`, and a filter then dropped the point. The
negative stop met a slanted face nearly a degree late. Both ends are now exact,
and a test checks them.

## What is still assumed

Everything here is assumed and nothing is built yet: the pad's modulus, its
strain limit, the insert's shear strength, the runaway speed and the
stepper's holding torque. Before trusting the numbers, push a printed sector
into a stop with a spring scale, and drop a weighted arm onto a pad to measure
its stiffness. The design, the checks and the regenerated manufacturing package
are in the repository under `ventures/open-tennis-robots/cad`, with the
reasoning in its README under "Azimuth hard stops".
