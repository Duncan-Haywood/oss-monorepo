---
title: "Why changepoint detectors cry wolf: four traps, measured"
date: 2026-10-21
description: "Sticky noise, seasons, trends and clumpy counts each make a changepoint method report shifts that never happened. How often, measured, and the fix for each."
tags: [projects, statistics, time-series, changepoint-detection, open-source]
---

# Why changepoint detectors cry wolf: four traps, measured

You ask a simple question of a chart: did the level change after the
release, the price rise, the sensor move? A changepoint method answers it
properly. It checks every possible split point and charges a penalty for each
extra segment, so it is not fooled the way a before-and-after average at a
date you picked from the chart is.

But the textbook methods assume two things about the data: the noise around
each level is independent, and the level is flat between changes. Real
business and sensor series rarely satisfy either. When they don't, the
detector does not go quiet. It reports changes that never happened.

The [changepoint detector](/ventures/changepoint-detector/README.md) in this
repository runs PELT (Killick, Fearnhead & Eckley 2012) and Bayesian online
changepoint detection (Adams & MacKay 2007) in the browser. Over two days of
work on it, AI coding agents (Claude sessions, with the owner steering)
measured each trap on seeded synthetic series, 40 runs per case, and added an
option for each one. Every number below is copied from the README's
Verification section, where the seeds and the code are listed.

## Trap 1: sticky noise

Many series have memory. Today's latency resembles yesterday's, and a warm
week follows a warm week. This is called autocorrelation. A method that
assumes independent noise reads a slow wander as a series of steps.

On 300-point series of AR(1) noise (rho 0.8) with **no change at all**, PELT
reported a false change in **40 of 40** runs. With `--ar1`, the noise scale
becomes the long-run standard deviation, and false runs fell to **4 of 40**.
The Bayesian pass, given the conditional AR(1) likelihood, went from 40 of 40
runs with a false detection to **0 of 40**.

The fix costs some power. A real shift of 8 was found exactly once, near the
truth, in 35 of 40 runs. A joint fit of the means and the autocorrelation
(`--ar1 joint`) wins back some of that on small shifts: a shift of 4 was found
in 34 of 40 runs, against 28 of 40.

## Trap 2: a seasonal cycle

Weekly or yearly rhythm swings a series up and down on schedule, and each
swing looks like a step. A real level shift of 4, hidden under a sine of
amplitude 10 with period 12 (144 points), was reported as exactly one change
in **0 of 40** runs without adjustment. With `--period 12`, the tool
subtracts a per-phase seasonal profile first. Then the shift was found as the
only change, within one point, in **33 of 40**. The adjustment needs at least
two full cycles of data.

## Trap 3: a trend

A series that climbs steadily has no changepoint, but a flat-level model can
only describe a ramp as a staircase. On 120-point ramps with no change, the
level model reported **5.5** changes per series. A model with a straight line
per segment (`--model trend`) reported **0.15**. The same model finds real
breaks in slope: a slope change at point 60 was located within 5 points in 30
of 40 runs.

## Trap 4: clumpy counts

Orders, incidents and visits per day are counts, and the Poisson model
assumes their variance equals their mean. Real counts are often clumpier
than that. On 200 flat counts, each drawn at a randomly varying rate, the
Poisson cost reported **3.55** false changes per series. A quasi-Poisson
penalty (`--overdispersion`) cut that to 0.78, and a negative-binomial cost
(`--overdispersion nb`) to **0.13**. A real 1.8x step was still found in 39
of 40 runs with either correction.

When the clumping is also sticky, so a busy day predicts another busy day,
the negative binomial does not help (6.75 false changes per series, against
1.20 for the quasi-Poisson penalty), because it still treats counts as
independent. The README says which option fits which kind of count.

## What this means if you have a chart and a question

- Before believing a detected change, ask whether your series has memory, a
  cycle, a trend or clumpy counts. If it does, switch on the matching
  option. Each fix has a measured cost, so it is not on by default.
- A change that both methods agree on, and that survives the right
  correction, is good evidence. A change only your eye sees usually is not.
- A changepoint says when the data changed. Whether your release caused it
  is a separate question that only you can answer.

The tool is free and runs in your browser, with nothing uploaded. There is a
plain-language guide for people arriving with that question:
[how do you know if a time series really changed?](/ventures/changepoint-detector/how-do-you-know-if-a-time-series-really-changed.html)
Assistants can read [its `llms.txt`](/ventures/changepoint-detector/llms.txt).
For many series at once or a production pipeline, R's `changepoint` package
and Python's `ruptures` are more complete. On 100 seeded cases this tool's
PELT returned the same changepoints as `ruptures` on all 100.

**A negative result worth keeping.** For clumpy counts with two changes of growth rate, the negative-binomial
cost removes the false alarms (0.4 false changes per straight series against 9.5 for plain Poisson) but does not find
both real bends: both knots within 15 points of the truth on 0 to 1 of 40 series, at counts around 10 and around 40.
Lowering the threshold found more bends and more false ones, not more correct ones. Two bends of that size sit below
what noisy counts can show, and the tool's README records the measurement rather than a tuned number.

*All figures are from seeded synthetic series in the tool's test suite, not
from users' data. Statistical analysis, not advice.*
