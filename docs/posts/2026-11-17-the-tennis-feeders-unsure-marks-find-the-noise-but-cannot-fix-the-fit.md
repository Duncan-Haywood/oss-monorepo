---
title: "The tennis feeder's unsure marks find the noisy wheels, and weighting them down still doesn't help"
seo_title: "Unsure marks find the noise, but weighting fails"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "The feeder firmware marks wheel readings it is unsure of. On 72 simulated builds the marks found the noisy wheels, but down-weighting them gained nothing."
---

The open tennis-ball feeder works out its launcher's efficiencies from how much
each wheel slows when a ball goes through. The ESP32 board fits each wheel's
drop from its tachometer pulses. When the fit's own misses leave the drop
uncertain (a standard error over 1% of it), it sets an "unsure" bit in the shot
record. Until now the Raspberry Pi only counted those marks and warned when
more than 10% of a drill's readings carried one.

[The last post](2026-11-17-the-tennis-feeders-worse-result-was-one-seeds-draw.md)
found where a jittery tachometer hurts most: the fast wheel of a slow spin
shot, whose readings scatter 1.0% around the true drop against 0.6% on a fast
shot. Two questions followed. Does the board's mark land on those wheels? And
would the Pi's fit improve if it counted a marked reading for less?

## The run

`tests/unsure_weight.py` ran a calibration drill and a slow drill on 18
simulated builds (three launchers, two wheel lags, three kinds of plant) on
four seeds: 72 builds and 5,616 wheel readings. Before any output
existed, I committed a rule with the script. Pick the best down-weight
(0.5, 0.25 or 0) on two design seeds. Ship it only if it also beats the
shipped weight of 1 on two held-out seeds.

## The marks work

On a clean tach and on a laggy ESC the board marked nothing. On the 3 µs
jittery tach it marked 41% of the slow shots' fast wheels and 4% of the fast
shots' wheels. Of the 23 readings more than 2% off, 16 carried a mark. A
marked reading was off by more than 2% 4.5% of the time, an unmarked one 0.55%.
The board's standard error tracks the true error too: readings it rated under
0.5% were 0.33% off (rms), and readings rated 1-2% were 0.98% off.

## The weighting doesn't

| seeds | weight 1 (shipped) | 0.5 | 0.25 | 0 (dropped) |
| --- | --- | --- | --- | --- |
| design | 0.58% | 0.57% | 0.58% | 0.58% |
| held out | 0.54% | 0.55% | 0.56% | 0.59% |

That is the mean spin efficiency error over all builds. The design seeds
favoured 0.5 by a hundredth of a point, and the held-out seeds reversed it. The
rule kept 1.

## Why

The simulator knows each wheel's true drop, so the fit can be rerun with some
readings swapped for the truth. On the jittery builds the spin error was 0.57%
as read and 0.03% with every reading true, so reading noise is nearly all of
it. With only the marked readings made true it was still 0.44%, and with only
the 23 worst readings made true, 0.52%. The error is a little noise on every
reading, not a few bad ones. A filter on the bad ones can't remove it, and
down-weighting them also throws away the signal they still carry.

So the mark stays a warning about the build. It is not a filter. The useful next
step is lowering every reading's noise under jitter.

## What this doesn't show

All of it is the simulator's Gaussian jitter of 3 µs per pulse. A real
tachometer may fail in lumps, such as a missed edge or a late interrupt, and
there the marked readings could carry more of the error. The details and every
number are in the firmware README's "Unsure marks on the noisy wheels" section
in `ventures/open-tennis-robots/`.
