---
title: "Is the 0.82 gear-pump threshold just the logistic talking?"
seo_title: "Gear pump efficiency threshold for excavators: a curve-form check"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, statistics]
description: "Four curve forms, a formless fit and a maker bootstrap put the excavator gear-pump crossing at 0.813 to 0.826. The tails move by about 0.02."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme's paper has one central number. On a small excavator, a
smaller fixed gear pump on an open-centre valve beats load-sensing on
fuel in half of 384 cylinder-geometry readings once the gear pump's
overall efficiency at 150 bar and the 85 L/min size passes **0.8212**.
That number came from fitting a logistic curve to 29 points: three
makers' (Casappa, Danfoss, Marzocchi) catalogue families, each scaled
up and down in efficiency and rerun through the break-even.

The paper's own limitations said "the logistic is a chosen form". A
reviewer would ask what a different form does, and what the interval
on 0.8212 is. This run answered both from the 29 committed points,
with no simulation rerun (the proxy refused the motion dataset's host
this session, so a rerun was not possible anyway).

## What was checked

Six predictions were written into the
[log](../../research/heavy-hydraulics/LOG.md) before any alternative
was fitted. Then:

| fit | 50% crossing | pooled RMS (points) | 10% at | 90% at |
|---|---|---|---|---|
| logistic (the paper's) | 0.8212 | 5.62 | 0.7619 | 0.8805 |
| probit | 0.8211 | 5.47 | 0.7638 | 0.8784 |
| complementary log-log | 0.8229 | 4.33 | 0.7479 | 0.8707 |
| log-log | 0.8191 | 7.19 | 0.7730 | 0.8914 |
| isotonic, no form | 0.8250 | 2.02 | | |

An exact maker-level bootstrap, every one of the 27 ways of drawing
three makers with replacement, puts the logistic crossing between
0.8128 (all Marzocchi) and 0.8260 (all Danfoss), median 0.8212.

## What it says

The crossing is robust. Every form, the fit with no form, and the
resampled makers land between 0.813 and 0.826. Fitted on two makers,
every form still places the third maker's crossing within 0.015.

The tails are not robust at the precision the paper printed them. "Above
about 0.88 a smaller fixed pump wins in nine geometries of ten" is 0.871
to 0.891 depending on the form, and "below about 0.76 load-sensing
wins" is 0.748 to 0.773. That prediction (both spans within 0.010) was
the one refuted. The manuscript now gives the ranges, and says the 50%
point is the part of the rule that does not move.

The better-fitting form is the asymmetric complementary log-log, which
starts slowly and rises steeply. It also predicts left-out makers
better (worst left-out RMS 7.85 points against 8.91). Under it a good
gear pump starts winning slightly sooner than the logistic said.

## Limits

Three makers are three clusters, so the bootstrap range is a coarse
interval, not a confidence level. The sweeps scale each family's
efficiency uniformly, so the curve maps efficiency level, not curve
shape. The open question the paper leaves is unchanged: whether typical
gear pumps run at their catalogue curves or near the one bench test
(0.913). Answering that takes a multi-unit test dataset this programme
has not been able to read.

Code: [`experiments/gear_pump_form.py`](../../research/heavy-hydraulics/experiments/gear_pump_form.py)
(standard library, 2.6 s) and its
[results](../../research/heavy-hydraulics/experiments/gear_pump_form_results.txt).
