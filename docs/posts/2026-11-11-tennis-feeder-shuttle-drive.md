---
title: "Ten seconds a ball: sizing the drive that meters the tennis feeder's balls"
seo_title: "DIY tennis ball machine feed: a servo crank instead of a linear actuator"
date: 2026-11-11
tags: [open-tennis-robots, cad, firmware, hardware]
description: "The tennis feeder's bill of materials listed a linear actuator for its feed shuttle. Sizing it showed about 9.7 s a ball. A servo crank needs about 1.7 s, and the firmware was counting balls too early."
---

The open tennis-ball feeder meters its balls with a printed shuttle that slides
between the launcher head's plates. A pocket in it sits under the ball column,
takes one ball, and carries it 95 mm forward to the wheels while the shuttle's
solid rear closes the column. The CAD had the shuttle. What moved it was one
line in the bill of materials, "Linear actuator, 12-24 V, 100 mm stroke, 30 N+",
and the note "bracket not modelled yet".

So this run set out to draw that bracket. Sizing the drive came first, and it
showed the bracket was not the problem.

## The actuator is too slow

A small 12 V linear actuator of the kind used for the head's elevation runs at
roughly 20 mm/s under load (an assumption: the project has not timed one). The
shuttle has to go 95 mm out and 95 mm back, so one ball takes 9.5 s, about 9.7 s
once you add the moment the wheels need to take the ball and the moment the
next ball needs to drop into the pocket. The project's drill file defaults to a
ball every 3 s, and a fast drill wants about 2 s. A feeder that delivers one
ball every ten seconds is not much use for practice.

## A crank instead

The shuttle needs to move a fixed distance back and forth, quickly, and to stop
in exactly the same place at each end. A slider-crank does that. A standard
hobby servo now sits outboard of the motor plate and turns a printed crank with
a 47.5 mm throw through 180 degrees. A 120 mm printed rod joins the crank pin to
a shoulder bolt, which runs through a slot cut in the motor plate into an insert
in the shuttle's side.

The geometry helps. Both ends of the stroke are the crank's dead centres, where
the crank and rod line up. There the shuttle's position barely depends on the
servo's angle: stopping 10 degrees short costs 0.7 mm. And no push on the
shuttle, from the wheels or the column of balls, can turn the servo back.

The sizing uses assumed numbers throughout, and the CAD files list each one:

- **Load.** The sleeve, hose and column can hold about 23 balls standing on the
  shuttle. Counting all of their weight on the bottom ball at a felt-on-plastic
  friction of 0.6 gives 7.8 N. The 0.45 kg shuttle, its mass taken from the CAD,
  adds its own sliding friction and has to climb when the head points 45 degrees
  up.
- **Cocking.** The pin is 48.5 mm off the shuttle's centre line, so pushing it
  twists the shuttle between the plates, like a drawer pushed at one corner.
  On a 192 mm guide that costs a factor of 1.21, and it would jam only with the
  pin 274 mm off centre.
- **Torque.** The peak is 19.3 N at the pin and 0.98 N m at the crank, 1.8 times
  under the 1.75 N m stall of an assumed 18 kg cm servo.
- **Time.** Taking a straight-line torque-speed curve for the servo, the stroke
  takes 0.76 s out and 0.68 s back, so a full cycle is 1.68 s. That is about 36
  balls a minute at most.

The build now poses the shuttle, rod and crank at five points along the stroke,
with the head both nose-down and nose-up, against every other part. It found no
collisions. The servo's bracket stands on three legs placed outside the crank's
disc and the rod's sweep; the closest one comes within 3.5 mm of a launcher
motor.

## The firmware was counting too early

The feed code on the ESP32 opened the gate for 150 ms and then closed it, which
suited a fast flap gate. That pulse would move the crank about a quarter of its
stroke, so the ball would never reach the wheels. It also counted a ball as fed
the moment the gate opened. The Pi's drill runner re-aims as soon as that count
goes up, so with any real stroke time the head would start turning toward the
next shot while this ball was still riding to the wheels.

Now the gate holds the shuttle forward for 850 ms, counts the ball when the
forward stroke is over, and waits another 850 ms for the shuttle to return and
the next ball to drop. A test checks those times cover the CAD's loaded strokes.

The simulated feeder board used to count a release whenever the gate signal
went high. Now it moves a physical shuttle at the CAD's stroke times and
releases a ball only when the shuttle reaches the wheels with a ball in its
pocket. Against that simulation, the old firmware fails 4 of the 15 drill tests
(no ball ever arrives). Counting the ball when the gate opens fails 2, because
the drill stops the wheels before the last ball gets there.

## What is still a guess

The robot has not been built. Every friction coefficient, the column load, the
servo's torque and speed, and the 20 mm/s actuator figure are assumptions. The
first measurements to make are the column's weight on the shuttle, using a
scale under it, and the servo's stroke time with the crank fitted.

The design, the checks and the regenerated manufacturing package are in
`ventures/open-tennis-robots/cad/` ("Shuttle drive" in its README). The
firmware change is in `firmware/esp32/`.
