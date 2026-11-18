---
title: "A finer clock made the tennis feeder's contact-time survey worse, and showed why it worked"
seo_title: "Tennis feeder: a finer tach clock broke the contact survey"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Keeping the ESP32 capture's 12.5 ns ticks instead of whole microseconds halved the fit's residuals and lost the held-out survey: 14 of 54 against 43."
---

The open tennis-ball feeder's ESP32 times each launcher-wheel revolution, and
[the last run](2026-11-18-the-tennis-feeders-tach-gets-a-hardware-clock.md)
moved that timing from a pin interrupt to the chip's MCPWM capture unit, which
latches an 80 MHz counter on the edge itself. One thing was still thrown away:
the capture's ticks were floored to whole microseconds before the tachometer
saw them. That floor adds up to a microsecond of error to every edge (0.29 us
standard deviation). The obvious next step was to keep the fractions.

## What changed

`PeriodTach` and `CaptureClock` now take a `sub` setting: periods in units of
1 / sub microseconds, still small integers inside the interrupt, handed to the
drop fits as microseconds. At `sub = 1` everything is bit-identical to before.
A rerun of the held-out survey through the new code at `sub = 1` gives exactly
the earlier file's counts.

The jitter estimate behaves as expected. On the simulated example drill a clean
capture reads 0.40 us at whole microseconds and 0.26 us at 1/8 us. The two
differ by 0.29 us in quadrature, which is the floor's own error. The 0.26 us
that is left is the wheel's real motion between revolutions.

## The survey, pre-registered

The board's contact-time survey refits each wheel at seven assumed ball contact
times and advises re-flashing `TAKE_US` when one fits clearly better than an
instant step. Before running the held-out set we wrote down that finer periods
would name more spread contacts than whole microseconds' 43 of 54, and would
never advise an instant one.

| set | whole microseconds | 1/8 us |
| --- | --- | --- |
| design (wheel lag 0.3 s) | 25 of 54 | 45 of 54 |
| held out (wheel lag 0.45 s) | 43 of 54 | 14 of 54, plus 1 instant build advised |

The design set looked like a clear win. The held-out set failed every clause,
so by the rule written in advance the board stays at whole microseconds.

## Why

The first guess was that the finer periods moved the fit's window by a
revolution. They do not: the fit picks the same slowest revolution on 21 of 22
wheels either way.

The per-wheel rows tell a different story. Several candidate contact times,
0 ms and 6 ms alike, reach the identical residual to four digits, and the rest
sit above it by amounts that do not track the candidate. At whole microseconds
the floor lifts every candidate to a common level and those jumps are small
beside it. At 1/8 us the level falls two to four times and the jumps decide the
sum. So the survey's earlier verdicts were trimmed sums of mostly take-blind
fits. They usually landed on the right contact time, but this run cannot say
how much of that the contact itself earned.

That is the next item: find out why so many fits ignore the contact time they
were given. All of this is simulated. No board has run the capture yet.

Code and numbers: `ventures/open-tennis-robots/firmware/esp32/README.md`
("Periods finer than a microsecond") and
`ventures/open-tennis-robots/eval/take-survey-capture-sub8-2026-11-18.txt`.
