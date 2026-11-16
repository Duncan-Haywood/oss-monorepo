---
title: "The tennis feeder was cutting its slow wheels short"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "Retesting the feeder's 1,000 rpm floor found the Pi was freezing slow wheels' data too early. Holding 0.3 s fixed the readings; the floor stays."
---

The open tennis-ball feeder measures its own launcher without a radar gun.
Each ball takes momentum from the two launcher wheels, and the board reads how
much each wheel slows down. A model of the wheel's recovery, fitted to the
speed loop's own commands, turns that slowdown into a drop. Those drops give
the launcher's speed and spin efficiencies.

Earlier today a 1,000 rpm floor went in: the fit ignores any wheel slower
than that. A 523 rpm wheel had shown only 70-78% of its real drop. That
floor was set with an older, cruder drop reading, so this run retested it
with the current one.

**The test.** A new sweep (`tests/min_fit_rpm_sweep.py`) runs a drill whose
spin shots put one wheel at 520-1,500 rpm. It runs on three simulated
wheels: an ideal one, one whose speed sensor jitters by 5 microseconds, and
one behind an electronic speed controller with its own 30 ms lag.

**The surprise was not the model.** Under 1,000 rpm, most of the bad
readings came from shots where the board never ran its recovery fit at all
and fell back to the older reading. The cause was on the Pi. It sent the
next shot's wheel speeds as soon as the ball left. The board stops recording
a wheel's pulses when its target changes, because what follows is the next
shot's speed change, not this ball. A wheel at 5,000 rpm has turned dozens
of times by then. A wheel at 550 rpm has turned once or twice after the
ball, and the fit needs three.

**The fix is a pause.** After a shot with a wheel under 1,000 rpm, the Pi
now waits for the board's verdict, about 0.3 s, before sending new speeds.
Readings at 750-1,000 rpm that were more than 2% off went from 16 of 54 to
0 on the ideal wheel, and from 19 to 0 on the jittery one. The spin
efficiency fitted from the whole log had a worst error of 2.39%; now it is
0.52% (ideal wheel), and 8.11% fell to 4.16% (jittery). A 30-shot drill took
about the same time, between 0.5% shorter and 2.4% longer, because the big
speed changes between shots already take longer than the pause.

**The floor stays.** Even with the pause, wheels at 500-750 rpm read
anywhere from 68% to 113% of their real drop. A 750 rpm floor was better on
one simulated wheel and worse on the other two, a mixed result on the same
builds it would be chosen from. So 1,000 rpm stays.

**Something new to look at.** Behind the 30 ms speed controller, on a wheel
that responds in 0.2 s, the speed loop never settled a 510 rpm wheel well enough to feed. Slow
wheels may need their own loop gains.

All of this is simulation; no real wheel has run below 1,000 rpm on this
machine yet. The tables and raw output are in the venture's
[firmware README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md)
("The 1,000 rpm floor retested"). The machine is open hardware, MIT licensed.
