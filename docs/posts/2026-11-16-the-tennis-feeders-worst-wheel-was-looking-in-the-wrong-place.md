---
title: "The tennis feeder's worst-fitting wheel was looking in the wrong place"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "One wheel in 56 fitted 10 to 60 times worse than the rest. The cause: the fit anchored two revolutions after the ball. Walking it back fixed all 21 cases."
---

The open tennis-ball feeder measures its own launcher. Each ball takes momentum
from the two launcher wheels, the board times every revolution of each wheel,
and a small model of the wheel's recovery, fitted to the speed loop's own
commands, turns the slowdown into a drop. The same fits, rerun at six assumed
speed-controller lags, let the board work out how slowly its ESC responds.

Earlier today a run found that one wheel in a drill of about 56 could fit 10 to
60 times worse than all the others. Its squared miss was larger than the rest
put together, so it decided the ESC lag on its own, and on a few simulated
builds it picked "no lag" for a 100 ms ESC. The fix then was to leave such
wheels out of the sum. Why they missed was left open.

**The answer is where the fit looks for the ball.** It anchors on the longest
revolution in the record and searches for the ball's moment only in the
revolutions either side of it. Usually the longest revolution is the first full
one after the ball. But behind a slow recovery, a laggy ESC on a heavy wheel,
the revolutions after the ball are almost level: 11,475 and 11,489
microseconds at 5,479 rpm. Speed-sensor jitter of a few microseconds decides
which is longer. When the second one wins, the ball sits outside the search
window, and the fit has to bend everything else to explain a drop that came
too early.

A new script compares each wheel's true ball revolution, from the simulator,
with the fit's anchor. On 144 jittery builds (8,064 wheels), all 21 wheels
that fitted more than 5 times worse than the median had the anchor two
revolutions late. No other wheel was an outlier.

**The fix walks back.** If the revolution before the anchor already holds 90%
of its rise above the pre-ball speed, the anchor moves back one, up to twice.
With it, no wheel was an outlier on those builds. The ESC-lag survey's plain
sum picked within 10% of the true lag on 102 of 102 builds (it was 93), and
70 of 72 on held-out seeds (67, with four builds picking zero). The trim stays
as a guard.

The calibration drill's launcher fit gained most on noisy sensors: with 10
microseconds of jitter the worst spin-efficiency error fell from 16% to 7.2%,
and with 20 microseconds from 22% to 16%. One result went the other way: on an
80 ms ESC lag the board was not told about, the worst build got worse (19.9% to
23.4%). With the lag set, as the survey tells the user to do, both versions
read within 2%.

All of this is on the simulator; a real sensor's noise and a real ball's
contact may move where the level run starts. The tables and raw output are in
the venture's
[firmware README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md)
("The outlier wheel was anchored past its ball"). The machine is open
hardware, MIT licensed.
