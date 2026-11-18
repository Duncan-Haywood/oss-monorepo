---
title: "A tennis ball is in the wheels for 6 ms, and the feeder's drop reading noticed"
seo_title: "A tennis ball is in the wheels for 6 ms: the drop fit noticed"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, measurement]
description: "Spreading a ball's take over its contact time raised the drop readings' scatter up to sixfold. A contact-time term fixes it; the fit can pick the time itself."
---

The open tennis-ball feeder learns how well its launcher wheels grip a ball
from how much each wheel slows down as a ball goes through. Its firmware
fits that drop from the tachometer's revolution times, and until now both
the fit and the simulator it is tested on treated the ball's take as one
instant. A real ball is not: 150 mm wheels grip it over about 50 mm while it
speeds up to 18-27 m/s, so it is in contact for roughly 4 to 6 ms. At high
speed a revolution takes only 7 ms.

## The prediction that failed

The simulator can now spread a take over a contact time, with a symmetric
(half-sine) force or one that peaks at first contact. Before running it, the
prediction went into the script: a short take should look to the revolution
times like a step at its centre, so the readings should barely move. The
rule: if a take of 6 ms or less pushed the readings' scatter above 0.3%, the
fit needed a contact-time term.

| take | reading scatter (sd) | spin efficiency error |
| --- | --- | --- |
| instant | 0.12-0.14% | 0.05-0.15% |
| 3 ms, symmetric | 0.27-0.30% | 0.24-0.36% |
| 4 ms, front-loaded | 0.48-0.50% | 0.58-0.96% |
| 6 ms, symmetric | 0.62-0.82% | 1.25-1.47% |

It was wrong past 3 ms, and worst at high speed, where the take is a large
share of a revolution (0.91% scatter at 4,500 rpm and up for the 6 ms take).

## A term for the contact time

The fit now takes an optional contact time: the drop is split into four
equal parts placed at the force profile's quantiles. The solve stays the
same size. Refitting the saved inputs of 575 wheel readings offline:

| fit | 6 ms | 4 ms front | 3 ms |
| --- | --- | --- | --- |
| step (as shipped) | 0.98% | 0.41% | 0.21% |
| told the true contact time | 0.19% | 0.21% | 0.17% |
| a fixed 4 ms guess | 0.75% | 0.26% | 0.19% |
| picks its own (least misfit of 7 times) | 0.17% | 0.11% | 0.09% |

The first refit didn't fix the 6 ms case (0.88%). The fit searched for the
ball's first contact only from the revolution where the slowdown shows,
but a long take starts earlier. Widening the search by the take's length
fixed that.

The last row is the useful one. A build doesn't know its ball's contact
time, and a wrong fixed guess costs almost as much as ignoring it. But
refitting at a few candidate times and keeping the one that misses least
did as well as knowing the answer. That is how the board already finds its
ESC's lag, so it can survey its contact time the same way on a
calibration drill.

Rerunning the whole drills with the board told the 6 ms contact time, the
readings went from 0.82% to 0.20% scatter (0.62% to 0.18% with a lagging
ESC). The spin efficiency error fell from 1.47% to 0.39% (1.25% to 0.35%).
That is still above the instant take's 0.05-0.15%, on one seed.

## What this does not show

All of it is simulated. The force profiles are assumed shapes, and a real
contact time likely shortens as the wheels speed up. The term ships off by
default. A real wheel's tach log around a ball is what settles it.

Code and numbers: `ventures/open-tennis-robots/tests/take_spread.py`,
`tests/take_fit.py`, and "A take that lasts a few milliseconds" in
`firmware/esp32/README.md`.
