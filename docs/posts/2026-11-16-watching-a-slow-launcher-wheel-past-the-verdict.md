---
title: "Watching a slow launcher wheel past the verdict: 500-750 rpm drops from 1.84x off to under 1%"
seo_title: "Watching a slow launcher wheel past the verdict"
date: 2026-11-16
tags: [open-tennis-robots, firmware, measurement, simulation]
description: "A tennis feeder's slowest wheels had three or four revolutions before the shot's verdict. Watching them a little longer brought every ball's drop within 1%."
---

The open tennis-ball feeder works out how hard each ball was hit from its two
launcher wheels. When a ball squeezes through, each wheel slows by an amount
set by the ball's momentum. Fit those drops over a drill and you get the
launcher's efficiencies without a radar gun. The board measures each drop by
fitting the speed loop's own recovery to the wheel's revolution times. That
fit wants about eight revolutions after the ball.

**The slow wheels never got eight.** The board judges a stroke 250 ms after
it ends, about 0.39 s after the ball meets the wheels. A wheel at 520 to
750 rpm (heavy topspin puts the bottom wheel there) turns three or four times
in that window. On the simulator those wheels read anywhere from 0.63 to 1.84
of their true drop: 73 of 156 were more than 2% off. The drill's last shot had
it worst. The Pi sent "stop" straight after the release, and the stop froze
the snapshot with one or two revolutions in it.

**The fix is to keep watching.** The verdict ("did a ball go?") still comes
at 250 ms, because the Pi needs it to spot an empty hopper. The drop measurement
no longer has to wait for the verdict. If a turning wheel has fewer than eight
revolutions after the ball, the board keeps logging that wheel until it has
them. It stops early if the speeds change, a new stroke starts or 1.2 s pass.
Then it runs the fit and sends the record again. The Pi holds the next shot's
speeds, and now the final stop too, for those revolutions: up to 1.45 s after
the release for a 520 rpm wheel.

**What it bought, on the simulator** (three plant models, three wheel lags,
three launchers, the board told its ESC's lag):

| 500-750 rpm wheels | more than 2% off | range |
| --- | --- | --- |
| before | 73 of 156 | 0.631-1.840 |
| now | 0 of 156 | 0.992-1.009 |

With the wheel floor where it was (wheels under 1,000 rpm left out of the
fit), the worst spin-efficiency error fell on all three plants: 1.51% to
1.24%, 2.81% to 1.57% and 1.74% to 0.67%. With no floor at all it fell from
18-38% to 0.7-1.0%. The 30-shot slow drill took 2.3 s longer.

**What it did not settle.** Should the floor go? Without it the worst error
is lower on three of four rows, but the means are mixed, and choosing it from
the builds it was scored on is how a sweep fits noise. A held-out set should
decide. And all of this is a simulated first-order wheel. No real wheel has
turned this slowly on the machine yet.

The code and the full tables are in the venture's
[firmware README](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md)
("Slow wheels watched past the verdict"). The raw output is in
`eval/slow-wheel-watch-2026-11-16.txt`.
