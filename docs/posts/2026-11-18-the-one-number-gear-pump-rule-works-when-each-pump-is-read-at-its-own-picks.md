---
title: "The one-number gear pump rule works when each pump is read at its own picks"
seo_title: "Gear pump idle drag: one-number rule works at each pump's own picks"
date: 2026-11-18
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, load-sensing]
description: "Read a gear pump's idle drag at the sizes the optimum picks for that pump, and a one-number excavator rule beats the two-price rule by a quarter."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should carry a cheap fixed gear pump
on an open-centre valve instead of a load-sensing pump. Its selection rule
gives the gear-pump efficiency at which the two tie on fuel. Two earlier
steps today tried to shrink that rule to one number per idle hour, the gear
pump's idle drag minus the load-sensing pump's standby power, using drag
read off a data sheet at one flow and then at two. Both fell short of the
two-price rule, which prices drag and standby separately. This step asked
why: is the one-number form wrong, or only the way the drag was read?

## The test

The earlier reads all sampled each pump's drag curve at fixed flows: the
median and quartiles of the pump sizes the fuel optimum picks, pooled over
six pump families. This step instead read each of the 14 pump variants at
the sizes the optimum picks *for that variant*, on its own break-even cell,
over the same 384 excavator geometries, 22 idle conditions and 4312 cells
(built from a measured excavator's motion, fuxi-robot/excavator-motion on
Hugging Face). Seven predictions were written down first
([`LOG.md`](../../research/heavy-hydraulics/LOG.md), milestone 7n), and
the previous step's results file reproduced byte for byte before any new
number was computed.

## What came back

All seven held.

| Rule | Left-out RMS, 308 diagonals | Unseen half idle speed | Unseen idle shares |
|---|---|---|---|
| Two-price (drag at 85 L/min, standby) | 0.0056 | 0.0059 | 0.0057 |
| One number, pooled-pick drag | 0.0056 | 0.0059 | 0.0059 |
| One number, two data-sheet reads | 0.0066 | 0.0074 | 0.0070 |
| **One number, own-pick drag** | **0.0042** | **0.0047** | **0.0043** |

Standby and drag trade 0.98 for one in the fitted rule, as the break-even
model says they should.

The reason the fixed reads failed is visible in the picks. For 13 of the
14 variants the optimum's median pick sits between 68 and 75.5 L/min, close
to the pooled 72. Danfoss, whose idle drag curve bends, is the exception:
its picks split, with a median of 63.5 L/min and a lower quartile of 57.
The optimum sizes that pump down, so at its own picks it pays 0.782 of the
drag the pooled picks charge it. The spun and geared Rexroth AZPN variants
do the same thing for a different reason: their lower quartile drops to about
55 L/min to stay below the size where the drive's extra drag starts. Across
pumps, the own-pick drag carries only 0.743 kW per kW of the pooled-pick
read. No fixed read can match that, because the shift depends on how high
or steep each pump's own drag is.

## What it does not show

This read is an oracle. The own picks come from the same model and motion
record that produce the crossings being predicted, including for the pump
family held out of each fit, so some of the gain may be that leak. No
builder has those picks. The result says the one-number form is sound and
locates the problem in the read; it does not give a builder a new rule. The
practical advice stays the same: price idle with two numbers, the drag at
85 L/min and the load-sensing standby, each per idle hour.

The next step is a builder-side stand-in for the own picks, for example
shifting the pooled pick weight down by the slope of the pump's drag curve,
scored against this oracle and against the two-price rule.

Code: [`experiments/gear_pump_ownpick.py`](../../research/heavy-hydraulics/experiments/gear_pump_ownpick.py);
results: [`gear_pump_ownpick_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_ownpick_results.txt).
