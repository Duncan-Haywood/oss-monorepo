---
title: "Two data-sheet reads match each gear pump's idle drag, and the one-number rule still fails"
seo_title: "Gear pump idle drag: why two catalogue reads miss a one-number rule"
date: 2026-11-18
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, load-sensing, negative-result]
description: "Read at two flows, a gear pump's idle drag lands within 2% of what the fuel optimum pays, yet the excavator rule does not improve: the scale is off."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should carry a cheap fixed gear pump
on an open-centre valve instead of a load-sensing pump. Its selection rule
gives the gear-pump efficiency at which the two tie on fuel, from a few
data-sheet numbers. Yesterday's step found that the rule collapses to one
number per idle hour, the gear pump's idle drag minus the load-sensing pump's
standby power, but only when the drag is averaged over the pump sizes the
fuel optimum picks. A builder does not have that pick distribution. This
morning one read at the picks' median (72 L/min) fell short. This step tried
two reads.

## What we registered and what came back

Before computing anything we wrote down seven predictions
([`LOG.md`](../../research/heavy-hydraulics/LOG.md), milestone 7m) for two
two-number reads: the mean of the drag at the picks' lower and upper
quartiles, and the 72 L/min read plus the drive extra of a spun or geared
pump. The numbers come from the same 22 idle conditions and 4312 break-even
cells as the last three steps, built from a measured excavator's motion
(fuxi-robot/excavator-motion on Hugging Face). Yesterday's results file
reproduced byte for byte first.

| Rule (out-of-sample RMS of the tie point, 308 cases) | Error |
|---|---|
| Two prices, drag at 85 L/min and standby (the current recommendation) | 0.0056 |
| One number, drag averaged over the picks (needs the pick distribution) | 0.0056 |
| One number, drag at 72 L/min (this morning) | 0.0065 |
| One number, mean of drag at 64 and 79 L/min | 0.0066 |
| One number, 72 L/min plus drive extra, as registered | 0.0070 |

Two of seven predictions held.

## Why matching each pump is not enough

The two-point mean is a good read pump by pump: for 13 of 14 variants it is
within 2% of the pick-averaged drag. The exception is the Danfoss family,
whose idle curve bends, so every read inside the picks sits about 7% above
what the optimum pays. A one-number rule has no free coefficient between
drag and standby, so what matters is the slope of the true drag on the read
across pumps, and that slope is 0.86, not 1, because the one high, bent
curve sets it. The two-price rule fits its own drag slope and absorbs the
scale. That is why it stays the better rule on the plain 85 L/min read.

## A mistake in the registration

The second read, as registered, counted the drive drag twice for one family:
its largest size gives 58.9 L/min, so its read at 72 L/min already carries the
step-up drive. We scored it as written and then fixed it after the fact,
labelled as unregistered. The fixed read is more faithful and scores worse
(0.0071), so the drive extra was not what held the one-number rule back.

## What a builder should do

Nothing changes: price idle with two numbers, the pump's drag at 85 L/min
(plus any drive's extra above its largest size) and the load-sensing pump's
standby power, each multiplied by idle hours per working hour. The next step
looks at why the bending family's drag at its own picks falls below any read
inside them.

Code: [`gear_pump_twopoint.py`](../../research/heavy-hydraulics/experiments/gear_pump_twopoint.py);
results: [`gear_pump_twopoint_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_twopoint_results.txt).
