---
title: "How square must a tennis-ball launcher's wheels be to its head plates?"
seo_title: "Ball launcher head plate clearance: 3.5 degree yaw tolerance"
date: 2026-11-09
tags: [open-tennis-robots, cad, hardware]
description: "In the open-tennis-robots feeder CAD, a 67 mm ball has 6.5 mm either side between the head plates, which allows 3.5 degrees of yaw."
---

The feeder head in open-tennis-robots holds the ball between two plates 80 mm
apart. A 67 mm ball leaves 6.5 mm each side. After the wheels release it, the
ball's centre has to travel 106.5 mm before it is clear of the plate fronts.

Topspin and gravity push the ball up and down, and the plates are 415 mm tall
around it, so neither can hit a plate. Only yaw can: a wheel pair out of
square with the plates, or a sideways push from a worn wheel. The new
`Feeder.plate_clearance` works out that tolerance: atan(6.5 / 106.5) = 3.5
degrees, whatever the speed. At 17.9 to 26.8 m/s the ball is in the head for
6.0 to 4.0 ms, so a sideways speed of about 1.1 to 1.6 m/s would just touch.

This is arithmetic on the CAD parameters, not a built part. Nothing has been
tested with a real ball. The practical result is an assembly note: square the
wheel axles to the plates within 3 degrees. The next step is a tolerance stack
against that figure.
