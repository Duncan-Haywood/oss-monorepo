---
title: "The tennis feeder read ball contact times too long because its four-part model bunched up"
seo_title: "Tennis feeder: why four parts read contact times long"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Four equal shares of a half-sine carry 16% less spread than it, so the feeder read contact times 9% long. Stretching them fixed it held out."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels. A take that lasts a few milliseconds slows
the wheel gradually, not in one step, and the board's drop fit models it as
four equal shares of the ball's push, placed at the quantile midpoints of a
half-sine force curve. A survey refits each ball at seven candidate contact
times and tells the builder which `TAKE_US` to flash.

[The last run](2026-11-18-the-tennis-feeders-take-survey-keeps-its-one-wheel-verdicts.md)
left an open question. On the simulator, the survey's own residual curve
bottomed out 0.2 to 0.4 ms *above* the true contact time, every time. The
suspect was the four-part model.

## A back-of-envelope reason

A take of a few milliseconds sits inside one wheel revolution of 7 to 20 ms.
What the revolution's period can see of it is mostly its centre and its
spread. All the models here share the same centre, so the contact time gets
fitted against the spread.

A half-sine force on [0, T] has variance 0.0474 T². The four quantile
midpoints sit at 0.230, 0.420, 0.580 and 0.770 of T, and four equal weights
there carry only 0.0397 T². That is 16% less spread. To look as spread out as
a real 4 ms take, the four-part model has to claim about
sqrt(0.0474 / 0.0397) × 4 ≈ 4.4 ms. That matches the size of the bias.

The simulator's own time step was the other suspect. The survey captures step
the plant at 0.1 ms, which adds only 0.01/12 ms² of spread, so it was ruled out.

## The test

No new simulation was needed. The previous run had stored every surveyed
wheel's revolution periods and command ticks: 54 drills on a design set and
54 held out, with takes between grid points. A new script,
[`tests/take_parts_refit.py`](../../ventures/open-tennis-robots/tests/take_parts_refit.py),
refits every wheel at every contact time from 0 to 8 ms in 0.25 ms steps, with
four models:

- the shipped four midpoints;
- 8 and 16 parts;
- `spread`: the same four midpoints stretched about the take's middle until
  they carry the half-sine's full variance. It costs the board the same four
  steps a fit.

The prediction and the rule for shipping were written into the script and
committed before the held-out rows were scored.

## Result

Where the survey's residual curve bottoms out, minus the true take, on the
off-grid takes, held out:

| tach | shipped 4 | spread 4 | 8 parts | 16 parts |
| --- | --- | --- | --- | --- |
| capture, 1/8 µs | +0.31 ms | −0.07 | +0.10 | 0.00 |
| jittery, 0.5 µs | +0.21 | −0.04 | +0.04 | 0.00 |

With 16 parts the bias is gone, so it was the model's. Stretching four parts
gets most of the way at no cost. Run through the board's own grid, parabola
pick and rounding, the stretched model put 46 of 54 held-out builds within
0.5 ms of the truth, against 41. All 54 stayed within 1 ms, and it advised no
re-flash on an instant take. That passed the pre-registered rule, so
`controller.take_offsets` now stretches the half-sine
(`TAKE_MATCH_SPREAD = True`).

## What it did not change

The drop the board reads barely moved. On an older stored set that keeps the
simulator's true drops, every model read the drop within 0.15 to 0.20% at the
true contact time. The shipped model at its own too-long contact time did
just as well. The long reading never hurt the measurement the feeder exists
to make. What it got wrong was the number shown to a builder: a contact time
9% too long, and long takes pushed onto the grid's last point.

## Costs and caveats

- Held out, two fewer spread takes were both named within 1 ms and advised
  (33 of 48 against 35). The rule did not count this, so it is reported here.
- On the design set, the stretched model put one fewer build within 1 ms, and
  its 3 ms takes on the grid read 0.65 ms low.
- Everything is simulated, with one seed per set and an assumed half-sine.
  If a real ball's push is not a half-sine, this fixes the label for a shape
  the ball does not have.

The next check is a fresh survey with the stretched offsets live on the
simulated board. If the fix holds, 7 ms takes should stop reading as the
grid's 8 ms end. Full numbers:
[firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md),
"The take fit's four parts and its high reading", and
[`eval/take-parts-refit-2026-11-18.md`](../../ventures/open-tennis-robots/eval/take-parts-refit-2026-11-18.md).
