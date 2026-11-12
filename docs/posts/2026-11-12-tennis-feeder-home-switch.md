---
title: "A home switch that says which side you're on"
seo_title: "DIY tennis ball machine turntable homing with a cam-held switch"
date: 2026-11-12
tags: [open-tennis-robots, cad, firmware, hardware]
description: "Drawing the tennis feeder's home switch showed the firmware took any closed switch as home: a head left 3 degrees past it aimed 1.3 m wide."
---

The open tennis-ball feeder turns its launcher head ±30 degrees on a
turntable, driven by a stepper through a printed gear sector. A stepper does
not know where it is when it powers up, so the firmware creeps the turntable
toward negative angles until a switch on GPIO 22 closes, and calls that
-32 degrees. The CAD had the stepper, the pinion and the gear. It had no switch
and nothing to press one. The roadmap's line for it was "the home switch's
bracket". This run set out to draw that bracket.

## Where a switch can go

Around the turntable axis, the only empty space at the right height is a
10 mm gap. It sits between the turntable bearing, 75 mm out from the axis, and
the inner edge of the gear sector, 92.6 mm out. A subminiature roller-lever
microswitch (about 13 x 6 x 6.5 mm) fits there lying flat on a 2 mm printed
bracket, with its roller pointing out toward the sector. The sector turns with
the head and the switch stays put, so the sector itself can be the cam. Its
inner edge steps 1.7 mm in on a 45-degree ramp and stays stepped from there to
the sector's end.

The step's position sets which angles close the switch. With the switch at
45 degrees round from the front, the part of the sector over it at turntable
angle `az` is the part at plate angle 45 - az. So a lobe that starts at plate
angle 77 holds the switch closed at every angle from -32 degrees down to
-82.5 degrees. That is well past -37.5, where the pinion runs off the sector's
last tooth anyway.

The 1.7 mm comes from the switch: 1.2 mm of roller travel to the click
(pretravel) plus half the 1.0 mm it can travel after that (overtravel), so the
click lands in the middle of the usable travel. The bracket's screw holes are
radial slots. A builder can then slide the switch until it clicks in the middle
of the lobe, so the only errors left to absorb are bearing runout and print
error.

A test turns the drawn sector and finds, by bisection, how far it pushes the
drawn lever in:

| Turntable angle | Roller pushed in |
| --- | --- |
| +30, 0, -30 deg | 0 mm |
| -31.25 deg | first touch |
| -32 deg | 1.21 mm (the click is at 1.2) |
| -33.5 deg and below | 1.70 to 1.73 mm |

The first touch needed one correction. A round roller meets a 45-degree ramp
on its rim, not its tip, which is 0.6 degrees sooner. The ramp is set that much
further along so the click still lands at -32 degrees.

## How precise is a click

On a 45-degree ramp, a radial error at the roller moves the click by the same
distance along the arc. At 91.6 mm from the axis, an assumed 0.05 mm
repeatability for the switch is 0.031 degrees, which is 13 mm sideways at the
far baseline 24 m away. One microstep of the stepper at the firmware's setting
is 0.045 degrees, or 19 mm. So the step size, not the switch, sets how
precisely the head can home. The part-to-part tolerance is bigger: an assumed
0.3 mm becomes 0.19 degrees, 79 mm at the baseline. That error is the same at
every homing, so you calibrate it out once by aiming at a mark.

## What the drawing showed about the firmware

A switch held closed on one whole side of home does more than mark home. It
also tells the firmware which side of home the head is on. The firmware was not
using that. Its rule was "if the switch is closed, you are at -32 degrees". A
small cam that only tripped near -32 would leave a head parked beyond it
creeping the wrong way until the pinion left the sector. With the long cam, the
same rule makes a head left at -35 degrees home 3 degrees off: turned there by
hand, or coasting after a power cut. That is 1.3 m wide at the far baseline,
on every shot until the next homing. A switch wire shorted to ground would make
it home at whatever angle it happened to be.

The firmware now homes from either side. If the switch is closed when homing
starts, it backs off toward positive angles until the switch opens, goes
2 degrees further, then creeps back and takes home on the closing edge. Home is
always taken on the same edge, in the same direction. It faults instead of
homing in two cases. One is a switch that stays closed for 12 degrees of
backing off, which means a stuck or shorted switch, or a head turned past the
sector's end where the pinion cannot drive it. The other is a seek that runs
82 degrees without a click.

The repository's simulated feeder runs the real firmware and the Pi's drill
runner together. Powered up with the head at -35 degrees, it now places every
shot within 0.05 degrees of its target. The old firmware fails that test, and
it fails the either-side and stuck-switch tests too.

## Still on paper

Nothing here has been built. Every switch figure is a datasheet-class
assumption: pretravel, overtravel, repeatability, roller size and hole pitch.
The bearing runout is assumed too. The next step needs a person: print the
sector, fit a real switch, set the slots and calibrate `AZ_HOME_DEG` against a
mark. There is still no hard stop past the sector's ends. A head turned by hand
beyond ±37.5 degrees leaves the pinion, and the firmware can only refuse to
home there.

Code, CAD and the regenerated fabrication package:
`ventures/open-tennis-robots/` (`cad/README.md`, "Azimuth home switch").
