---
title: "Why a slow tennis-launcher wheel never settled, and the gate that let balls go 13% off"
seo_title: "Why a slow launcher wheel never settled: tach delay vs gains"
date: 2026-11-16
tags: [open-tennis-robots, firmware, control, simulation]
description: "A 510 rpm launcher wheel rang for ever because the tachometer's delay grows as the wheel slows. Scaled gains and a longer gate fixed it on the simulator."
---

The open tennis-ball feeder spins two launcher wheels and reads their speed
from one pulse per revolution. An earlier run found that on one simulated
build, with a 30 ms ESC lag and a quick 0.2 s wheel, every drill stopped at its
first heavy-spin shot: the slow wheel, aimed at about 510 rpm, never held its
speed long enough to feed. This run went looking for why.

**The tachometer's delay grows as the wheel slows.** The firmware averages the
last four revolutions, and the reading only changes once a revolution. That
puts it about 2.5 revolutions behind the wheel. At 3,500 rpm that is 43 ms. At
510 rpm it is 0.29 s. The speed loop's gains were fixed, tuned on wheels at
1,500 rpm and up. A linear model of the loop gives its phase margin. It is 66
degrees at 3,500 rpm on that build, 18 at 1,000 rpm and minus 48 at 510 rpm.
A negative margin means the loop rings for ever, and on the simulator the
wheel swung between 460 and 564 rpm without stopping.

**Fix one: scale the gains with the speed.** Under 1,500 rpm both gains now
shrink in proportion to the target. That keeps the loop's crossover a fixed
share of the delay, and the margin at 510 rpm goes from minus 48 to plus 63
degrees.

**A second fault turned up in the sweep.** The ready gate wanted the wheels
within 3% for 150 ms. At 510 rpm that is one or two readings of a
four-revolution average, so a wheel still closing on its target could pass the
gate while 13% off its true speed. A ball fed then flies short or long. The
gate now also waits for six revolutions of the slowest wheel: 0.71 s at
510 rpm. From 2,400 rpm up, the 150 ms still governs.

**What the sweep measured.** There were 336 simulated cases. In each, one wheel
was set to 510-2,000 rpm, starting from rest or braking down from 5,000. There
were four plant models, three wheel lags, and two free speeds the firmware
misjudges by 22%:

| firmware | never steady | fed over 3% off | median time to steady |
| --- | --- | --- | --- |
| before | 20 | 165 | 3.59 s |
| scaled gains only | 0 | 100 | 3.55 s |
| longer hold only | 26 | 54 | 3.70 s |
| both | 0 | 14 | 3.76 s |

Neither change works alone. The longer hold by itself makes more cases
never settle, because a ringing wheel rarely stays inside the band for longer.
The scaled gains alone settle everything but still feed off-speed balls.

**The drill that stopped now runs.** All three builds that aborted now finish
their slow-shot drill, and they read the launcher's spin to within 0.9% on
average. On the six builds that already ran, one wheel at 1,107 rpm got a
badly wrong drop reading: 1.48 times the true value. That one wheel took the
worst build's spin error from 2.2% to 6.7%. The old firmware had four smaller
misses on the same build, so this looks like a one-off. It is still not
explained.

**What is not known.** It is all simulation, with a first-order wheel and a
model ESC. The six-revolution hold was picked as the best of three values on
these same cases. The 14 balls still fed over 3% off are mostly at
1,250-2,000 rpm, where neither change does much. A tachometer that averaged a
fixed time instead of four revolutions would cut the delay itself, and that
is the next thing to try.

The details, the margin table and the sweep are in the venture's
[firmware README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md)
("Slow wheels need slower gains"). The machine is open hardware, MIT licensed.
