---
title: "The tennis feeder's ESC survey had the right answer and misread it"
seo_title: "Tennis feeder: a spline fixes the ESC-lag survey's pick"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, curve-fitting]
description: "The feeder board's ESC-lag survey read short lags about 10% low. The parabola was at fault, not the data. A spline took held-out hits from 27 to 39 of 44."
---

The open tennis-ball feeder's ESP32 surveys its own ESC. After each ball it
refits both launcher wheels' recovery at seven assumed ESC lags (0, 20, 50,
100, 150, 200 and 400 ms) and sums how badly each fits. The lag with the least
sum is the build's ESC lag, and the Pi tells the builder what to set
`ESC_TAU_US` to. Between grid lags, a parabola through the least sum and its
two neighbours refines the number
([firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md),
"The ESC-lag survey's pick between grid lags").

An earlier run lengthened the window each refit reads, which fixed long ESC
lags that had read 20 to 60% off. It also left a note: short lags now read a
little low. On the simulator a 40 ms ESC read 36 to 37 and a 50 ms one 44 to 47.
That was within the 15% bar, but it was a bias, and the number goes straight
into the builder's config.

## The data was right

The first question was whether the longer window had biased the fit. I refit
the stored drills at 28 lags instead of 7, with the same window. On every 40,
50 and 90 ms build the least summed residual sat exactly on the true lag, to
the 5 ms step. So the board had the answer in its sums, and the error came in
the last step.

Near its least, the residual curve is a V, and one side is steeper than the
other. A parabola through three points of a lopsided V does not put its vertex
at the V's point. Which way it misses depends on where the true lag falls
between grid lags. So the error changes with the lag: 40 ms read low, 210 ms
read high (222 to 234), and 120 ms came out about right.

## What fixed it, and what didn't

I tried the cheap changes first, all scored on the board's own sums for the
70 stored drills:

| how the pick is refined | within 5% of the true lag | max error |
| --- | --- | --- |
| parabola, log axis (shipped) | 41 of 70 | 11.7% |
| parabola on other axes or on rms | 25 to 41 | up to 29% |
| four-point cubic | 56 | 12.3% |
| moving the seven grid lags (geometric spacing) | 24 to 41 | up to 17% |
| natural cubic spline through all seven sums, log(lag + 10 ms) | **68** | **6.4%** |

One grid search found a seven-lag grid scoring 56. It got there by putting
grid lags on the design drills' own ESC lags, so it would not carry over to
other builds.

The spline uses every grid sum, not just three, so the flanks of the V
shape the curve near its point. Its one setting, an offset that gives 0 ms a
place on the log axis, scored 68, 68, 65 and 61 at a quarter, a half, one and
two times the first grid lag. Half ships.

## Held out

Before any new drill ran, the prediction and the rule for shipping went into a
commit. The held-out drills used ESC lags none of the design drills had (25 to
270 ms), wheel lags 0.45 and 0.65 s, a new seed and a different simulated
launcher, 44 drills in all:

| held out | within 5% | within 15% | max error |
| --- | --- | --- | --- |
| parabola | 27 of 44 | 40 | 48.1% |
| spline | 39 of 44 | 42 | 48.1% |

The rule needed more drills within 5%, at least as many within 15%, and no
larger worst miss. It held, and the board now uses the spline. The worst miss
is the same for both because two 270 ms drills had their least sum at the
grid's 400 ms end. Neither pick can refine past the end, and the Pi already
answers that case with "scope the ESC".

One part of the prediction failed. I expected the parabola to read 25 to 75 ms
lags low on average. It read 25 to 33 ms high and 45 to 60 ms low, which nets
to +2%. That fits the explanation above better than my prediction did: the
parabola's error changes sign between grid lags, so it doesn't simply read
short lags low.

## What it cost

Nothing in the survey: the refits, the grid, the frame the board sends the Pi
and the survey's time are all unchanged. Only the refined number moves. The
pick solves a seven-point tridiagonal system and two quadratics once per
report. Everything here is still simulated, with a first-order ESC behind a
first-order wheel, so the V's shape is that model's. The next real step is a
real ESC's step response on a scope. The next desk step is checking whether
the take survey's contact-time pick, still a parabola, has the same lean.
