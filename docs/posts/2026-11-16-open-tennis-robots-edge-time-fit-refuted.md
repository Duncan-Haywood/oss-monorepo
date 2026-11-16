---
title: "The textbook fix for a jittery tachometer made our ball machine's spin estimate worse"
seo_title: "Fitting tach edge times instead of periods: a refuted fix"
date: 2026-11-16
tags: [open-tennis-robots, robotics, firmware, estimation, negative-result]
description: "Tach jitter sits on edge times, so fitting their running sums should beat fitting periods. On our simulator it read the spin worse. Numbers and likely cause."
---

# The textbook fix for a jittery tachometer made our ball machine's spin estimate worse

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open, MIT-licensed tennis ball machine. It hasn't been built yet: everything here runs the real firmware on a simulated board. Each ball slows the two launcher wheels a little, and the firmware fits that drop from the wheel tachometer's pulse times. A drill's worth of drops then tells the planner how fast and how much spin this particular build puts on a ball, with no radar gun.

Earlier today we found that tach timing error is what hurts that fit most. With 5 microseconds of jitter on each pulse, the drill's spin estimate was up to 5% off. With 10 microseconds, it was up to 16% off. So the next item on the list looked obvious.

## The fix that should have worked

The fit worked on revolution periods, the time between two pulses. But the timing error sits on each pulse, not on each period. If one pulse comes 10 µs late, the period before it is 10 µs long and the one after it is 10 µs short. Neighbouring periods share their errors with opposite signs, and a least-squares fit on periods treats them as independent.

The standard fix is to fit the running sums of the periods, which are the pulse times themselves. Each sum's error is then just that pulse's own error, plus the first pulse's, which a free offset absorbs. Ordinary least squares on the sums is then the statistically right weighting. Two of our sessions took this item at the same time. One [landed it as an option](../../ventures/open-tennis-robots/firmware/esp32/README.md) (`edges=True`, off), after finding it spread single-wheel drops a little wider. This post covers the other session's question: does the spin estimate for a whole drill also get worse, and why?

## What happened

On a single simulated wheel (24 speeds, drop sizes and wheel lags, 6 noise draws each), the pulse-time fit did one thing well. The period fit occasionally picks the wrong moment for the ball at 5,000-6,000 rpm and reads the drop 60% off. Fitting the pulse times removed those wild readings at 10 µs of jitter. Its worst error fell from 63% to 5%.

Its typical error got worse, though. At 2, 5 and 10 µs, the 90th percentile of the drop error rose (0.69% to 0.83%, 1.46% to 1.68%, 2.61% to 3.18%). The launcher fit downstream already discards wild rows, so typical error is what reaches the drill. Over 54 simulated calibration drills, with the shipped option:

| plant | spin error rms, periods | spin error rms, pulse times |
| --- | --- | --- |
| no jitter | 0.62% | 0.54% |
| 5 µs jitter | 2.20% | 2.92% |
| 10 µs jitter | 6.55% | 9.02% |
| 80 ms ESC lag | 8.67% | 9.77% |

The fix lost where it was meant to help, in the whole drill as on single wheels. It stays in the firmware as an option, switched off.

## Why, as far as we checked

First, the noise model was right: the simulated period errors have a lag-1 correlation of -0.498, against -0.5 in theory. Second, the theoretical gain turns out to be small. In a 13-row linear toy with a step in it, fitting the sums cut the step's error by only 4%. A step is a sharp, high-frequency feature, and that's where differenced noise is already strongest, so the period fit loses little.

Third, we fixed the wheel's lag to its true value and added pulse errors after the fact, so the speed loop couldn't react to them. The sums still read worse. What remains is the moment the ball hit, which the fit chooses by least squares. On the sums, a miss early in the window carries into every later sum. That's our best explanation, but we haven't proven it.

## What's next

The period fit stays. If a real hall sensor shows 10 µs or more of jitter, the target is the rare wild reading: choose the ball's moment on the pulse times, then estimate the drop on the periods. The real jitter is still the first number to measure on a built wheel.

The code, the drill sweep (`tests/edge_fit_drill.py`) and the raw numbers are in the [firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md) ("The drop on the edge times: tried, kept off") and in `ventures/open-tennis-robots/eval/edge-fit-drill-2026-11-16.txt`. The single-wheel numbers above came from this session's own variant of the fit, which sums the rows without weights. The shipped option weights each row by its span, and its drill numbers in the table are the shipped option's. Everything above is simulated. The physics and the plants are assumptions, not measurements of a real machine.
