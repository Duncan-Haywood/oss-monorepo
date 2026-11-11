---
title: "A straight line in degrees is a curve in millimetres: firmware for the tennis feeder's elevation actuator"
seo_title: "DIY tennis ball machine firmware: driving a linear actuator for elevation"
date: 2026-11-11
tags: [open-tennis-robots, firmware, hardware]
description: "The open tennis feeder tilts its head with a linear actuator. Mapping the angle evenly onto the stroke would have aimed up to 1.46 deg high and landed a 20 m/s drive a metre deep."
---

Earlier today the open tennis-ball feeder got an elevation drive in its CAD:
a 150 mm linear actuator pushes a pin on the launcher head, so tilting the head
from 15 degrees nose-down to 45 nose-up shortens the actuator from 371 mm to
248 mm hole to hole ([the sizing post](2026-11-11-tennis-feeder-elevation-drive.md)).
The firmware still drove elevation as a hobby servo: it spread a pulse width
evenly over the angle range.

That would have been wrong even with an actuator that takes a servo pulse. The
pin swings on an arc about the pivot, so the actuator's length is not a straight
line in the angle. Near nose-down one millimetre of stroke is 0.43 degrees, near
nose-up it is 0.53. Spreading the stroke evenly over -15 to +45 degrees aims
high everywhere in between, worst at +5 degrees by **1.46 degrees** and still
1.39 at +10.

How much does that matter? The project's flight model (drag and the bounce, no
spin, ball launched 1 m above the court) puts a 20 m/s drive at +10 degrees down
15.2 m away. At +11.46 degrees it lands 16.2 m away: a metre deep, the
difference between a ball on the baseline and one out.

## What landed

The firmware now carries the same pin-and-anchor geometry as the CAD
(`ElevationGeometry` in `firmware/esp32/controller.py`). A test checks it
against the CAD's own `Feeder.elev_act_len` at every degree from -40 to +70, so
moving the pin in the CAD without updating the firmware fails the build. The
command from the Raspberry Pi is still an angle; the board turns it into a
stroke and back by bisection.

There are three ways to know where an actuator is, and builders will have all
three, so the axis (`LinearAxis`) takes a mode:

- **rc**: actuators with their own position loop and a servo input (the
  Actuonix L16-R kind). The pulse is now the stroke fraction, with the geometry
  applied first. The firmware cannot read the position back, so it estimates
  arrival from the actuator's speed.
- **pot** (the default): actuators with a feedback potentiometer, driven through
  an H-bridge. A proportional loop with a 0.5 mm deadband, about a quarter of a
  degree. It faults and stops if the pot reads outside its calibrated span (a
  wire off) or if the motor is on and the stroke moves less than 0.5 mm in 0.6 s
  (jammed, or no power to the bridge).
- **timed**: a bare actuator with only its internal limit switches. At power-up
  it retracts long enough to cover the whole stroke and calls that zero, then
  runs at full speed and integrates its measured speeds, which differ: the
  head's weight pulls the nose up, which helps retracting. Every move adds 5% of
  its length to an error budget, and a move that would take the budget past
  3 mm homes first when that would leave less error.

In simulation, with the actuator 2% faster than the firmware was told, a
mid-range move landed within a degree; at 5% it landed 1.8 degrees off, inside
the budget the axis reported but not good enough to aim with. That is the case
for the pot: timed mode works, but only as well as you measured the speeds.

One finding the timed mode surfaced: homing on the retract limit takes the head
past its range. With the drawn 240 mm actuator fully retracted, the head sits at
+48.8 degrees, not +45. The CAD's collision sweeps only go to +45, so a builder
using timed mode needs the head to clear that extra 3.8 degrees, or a shorter
retracted length.

## The feed gate waits for the aim

Elevation is slow: at 20 mm/s the full range takes about six seconds, against
one second for the azimuth stepper. Before today nothing stopped the feeder
releasing a ball while the head was still tilting. Now the gate opens only when
both wheels are within 5% of their speeds **and** both aim axes have arrived,
and telemetry sets a new `FLAG_AIM_SETTLING` bit while either is moving, so the
Pi knows when the next shot can go.

## What is not known

All of this is tested against a simulated actuator in `tests/test_robots.py`.
None of it has run on an ESP32 or moved a real actuator. The speeds, the pot's
end readings and whether your actuator holds with the power off (if not, set
`ELEV_SELF_LOCKING = False` and every stop re-homes) have to be measured on a
build. The pin map, the modes and the calibration steps are in the
[firmware README](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md).
