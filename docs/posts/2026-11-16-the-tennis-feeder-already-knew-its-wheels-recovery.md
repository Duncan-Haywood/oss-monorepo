---
title: "The tennis feeder already knew how its wheels would recover: it had sent the commands"
seo_title: "Fitting a launcher wheel's speed drop with the loop's own commands"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "The open tennis feeder now fits each ball's wheel-speed drop with the ESC commands it logged. On the simulator its spin error fell from 8% to under 2%."
---

The open tennis-ball feeder measures its own launcher without a radar gun.
Each ball takes momentum from the two wheels, and the firmware reads each
wheel's speed drop from the times between its tachometer pulses
([how that works](2026-11-16-the-tennis-feeders-wheels-double-as-a-radar-gun.md)).
The drops were good to about 1.3%, and that was not good enough for spin:
spin comes from the *difference* between two drops, so a small error in each
becomes a large one in the spin
([why](2026-11-16-why-the-tennis-feeders-spin-reading-was-off.md)). The
calibration drill's spin efficiency still came out up to 8% off on the
simulator, with a bias that changed with wheel speed.

**The shape was the problem.** The firmware fitted the wheel's recovery after
the ball with a free parabola over five revolutions. But the speed loop
shapes that recovery. Its tachometer averages four revolutions, so it sees
the drop late. Then the PI controller pulls the wheel back and overshoots,
and the deficit swings 20 to 30% of the drop past zero before it settles. A
parabola meets a different part of that curve at every speed.

**Modelling the loop did not work.** Simulating the firmware's own
tachometer and PI controller reproduces the captured pulse times closely.
But the loop's response depends on where its 10 ms control tick falls
relative to the ball. Across tick phases the fitted drop moved by 3% either
way at nearly the same fit quality, so the pulse times alone cannot settle
it.

**The board knows its commands.** It does not need to model its controller,
because it sent every command itself. So now it logs each tick's ESC command
while it watches a feed stroke. It then fits the pulse times with the wheel
as a first-order lag driven by those commands. There is one unknown time
constant, searched on a grid and then refined, and an unknown ball moment
inside two revolutions. For each pair the rest is linear. A free constant
lets an ESC whose speed is not proportional to its throttle fit too. The fit
runs one step per control tick, so no tick stalls. The record goes to the Pi
with the old drops first and comes again under the same sequence number when
the new ones are ready.

**On the simulator** (all numbers from the repository's sweeps):

- Each wheel's drop is now within 0.30% (sd) of the true one, against 1.34%.
  No speed band is more than 0.16% off; the parabola was 0.84% off at 1,000
  to 2,000 rpm. On four builds with wheel lags and free speeds the design set
  never had, the sd was 0.28%.
- The calibration drill's spin efficiency error: worst 1.6% on 18 builds
  (8.1% before) and 1.9% on 12 held-out builds (7.8% before).
- A drill re-planned from its own shots: the worst build's median miss fell
  from 0.31 m to 0.07 m. One shot got worse, from 0.34 m to 0.40 m off.

**What this does not show.** The simulated wheel *is* a first-order lag of
its command, which is exactly the model being fitted. These numbers are the
method's best case. A real ESC with its own speed control, a torque limit,
belt slip or a jittery sensor would each leave a shape the model lacks.
Nobody has timed the fit on a real ESP32 under MicroPython either. The next
step is a real wheel's tachometer and command log around a ball.

The code, the sweeps and their outputs are in
[`ventures/open-tennis-robots`](../../ventures/open-tennis-robots/firmware/esp32/README.md),
under "A recovery shaped by the loop's own commands". MIT licensed.
