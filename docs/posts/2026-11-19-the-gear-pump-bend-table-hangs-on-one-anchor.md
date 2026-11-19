---
title: "A gear-pump pick table survives a new bend shape, not a new anchor"
seo_title: "Gear pump bend table: shape-robust, anchor-sensitive"
date: 2026-11-19
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, sensitivity-analysis]
description: "Rebuilt with a hinge or an exponential bend, a synthetic gear-pump pick table still beats the two-price rule; anchored at 79 L/min instead of 64, it loses."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should carry a cheap fixed gear pump
instead of a load-sensing pump. Its selection rule predicts the gear-pump
efficiency at which the two tie on fuel. The best builder-side form so far is
a "two-price" rule: the pump's idle drag and the load-sensing pump's standby
power, each with its own coefficient.

Yesterday's milestone (7r) tried something a pump catalogue could print: a
table of the pump sizes the fuel optimum picks, one row per *bend* of the
idle drag curve (drag at 79 L/min over drag at 64 L/min). No measured pump
bends like the Danfoss family (1.78 against 1.28 to 1.50 for the rest), so
the rows were built by bending the other pumps' curves with a power of flow
and running the motion model on them. It beat the two-price rule, 0.0052
against 0.0056 left-out RMS over 308 cases. The log called that margin
"well inside what a different synthetic shape could move". Today's run
tested exactly that.

## Four shapes with the same bend

Each shape gives the bent curve the target bend exactly. The predictions
were written into the log before any number was computed:

| shape | what it holds fixed | left-out RMS | Danfoss | row pick at bend 1.8 |
|---|---|---|---|---|
| power, pivot 64 (7r) | level at 64 L/min | 0.0052 | 0.0063 | 68.0 L/min |
| hinge above 64 | the whole curve below 64 | 0.0053 | 0.0066 | 68.0 L/min |
| exponential | level at 64 L/min | 0.0053 | 0.0065 | 68.0 L/min |
| power, pivot 79 | level at 79 L/min | 0.0059 | 0.0110 | 72.0 L/min |
| two-price rule | (reference) | 0.0056 | 0.0061 | |

The three shapes anchored at 64 L/min agree to half a litre per minute on
every row and beat the two-price rule in all three tests (left-out
condition, unseen half idle speed, unseen idle shares). The fourth, a power
law of the same bend held at 79 L/min, makes a steeper curve *cheaper* at
every size below 79. The optimum then has no reason to pick smaller, its
row stays near 72 L/min whatever the bend, and the table falls back to
about the failed pooled table of 7q. Six of eight predictions held; the two
that failed were the pivot-79 shape beating the rule and the four shapes
agreeing within 0.0005.

## What it means

The bend table's gain does not depend on whether the bend is a power, a
hinge or an exponential. It does depend on one physical assumption: a pump
whose drag curve bends more pays *more drag above* its lower-quartile size,
not *less drag below* it. That is a property of real pumps, and the one
measured pump that bends (Danfoss) cannot be used to settle it without
leaking into its own test. Without Danfoss, all four shapes score the same
(0.0052 to 0.0053), so the shape matters only for the pump the table exists
to help.

So the two-price rule stays the form a builder should use, and a measured
second gear-pump family with a strongly bending idle curve is now the test
for three things at once: 7o's tilt, 7r's table and today's anchor.

Code and numbers:
[`experiments/gear_pump_bendshape.py`](../../research/heavy-hydraulics/experiments/gear_pump_bendshape.py),
[`gear_pump_bendshape_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_bendshape_results.txt);
the registration and outcome are in the
[log](../../research/heavy-hydraulics/LOG.md), milestone 7s. Everything here is
from a simulation on measured excavator motion and digitised data-sheet
curves; the bent curves are synthetic, so this is a sensitivity, not a
measurement.
