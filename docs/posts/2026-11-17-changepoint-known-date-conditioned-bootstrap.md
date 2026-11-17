---
title: "Conditioning on the guard: a calibrated test that cannot see"
seo_title: "Selective inference on a sticky interrupted time series"
date: 2026-11-17
tags: [changepoint-detection, statistics, interrupted-time-series, selective-inference]
description: "A bootstrap that conditions on how a sticky series passed its guard flags 4.9% of no-change series and 2.6% of real steps. Calibrated, and blind."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can test a date you name, a law or a launch, for a step or a change of slope. Its test has a guard. A series that wanders like a random walk is refused, because any pair of lines will "explain" a wander and the test would fire on noise.

There is one way past the guard for a sticky series. If a step at your date makes the leftover noise much less sticky than random walks usually manage, the series is let through. Yesterday's run found that this path is not calibrated. Of 26 no-change series that came in this way, 17 got p under 0.05.

## The textbook fix

When a test only runs on data that passed a filter, the honest p-value comes from the same filter. Simulate data with no change, keep only the copies the guard lets through *the same way*, and ask how often those copies beat the real statistic. This is selective inference, the idea behind valid p-values after the lasso picks variables. Here it takes a few lines of code and a lot of simulation, since only 2 to 4% of the simulated copies get through.

## What it found

I scored both tests on simulated series that came in by the cut. Exploration was on one set of seeds and the numbers below come from a fresh set:

| Series let through by the cut | count | old p under 0.05 | conditioned p under 0.05 |
|---|---|---|---|
| no change (sticky noise, random walks) | 306 | 77.5% | 4.9% |
| a real step of 2-4 noise sd at the date | 156 | 91.0% | 2.6% |

The old test flags almost everything on this path, real or not. The conditioned test is calibrated, at 4.9% against a nominal 5%. But it flags real steps *less* often than no-change series.

The reason is simple once you see it. The thing that lets a series through is a step at the date cutting its stickiness, and that is the same evidence the F test reads. Once you condition on it, nothing is left to test. Two softer versions did no better. Conditioning only on "sticky about a line" gave back the old rates. Adding a random walk to the simulated nulls took power to zero.

## What shipped

- **The date test is now on the page.** Type a label in "Test a date you name" and the browser runs the same test as the CLI: the step, its 95% range, the slope change and bootstrap p-values. `analyze({ knownDate })` returns the same fields.
- **Honest numbers where the test cannot help.** On a series that came in by the cut, the page and the CLI show the estimates and say plainly that the p-value cannot tell a change from noise: 77% against 91% in simulation. Such a result is never marked significant.
- **The conditioned bootstrap stays in the code, off by default**, so anyone can rerun the table.

The way forward on these series is evidence the guard does not use. A control series is one: the 1983 seat-belt law cut deaths among drivers and front-seat passengers, and rear-seat passengers, whom it did not cover, show no step. Several dates across several series is another.
