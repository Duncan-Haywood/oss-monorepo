---
title: "Hold out each gear-pump family in turn: efficiency plus drag still lands within 0.004"
seo_title: "Gear pump efficiency and drag rule, tested leave-one-family-out"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, cross-validation]
description: "Hold out each of five gear-pump families: efficiency plus no-load drag predicts its threshold within 0.0042; efficiency alone misses by 0.017."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a smaller fixed gear pump on an open-centre valve
burns less fuel than load-sensing on a small excavator. Over 384 measured
cylinder-geometry readings, the answer turns on the gear pump. Earlier
today a [fifth family](2026-11-15-a-fifth-gear-pump-maker-tests-the-two-number-rule.md),
Rexroth's AZPG, showed that one number (efficiency at 150 bar) is not
enough. A second number, the pump's power draw at zero pressure, predicted
it within 0.005.

That was one held-out family against a rule calibrated on one shape. This
run asked the harder question: if every family takes a turn as the one
the rule has never seen, how far off is it?

## Twenty-five pumps that don't exist

Each family brings two things: the shape of its efficiency map (how
efficiency moves with size and pressure) and its no-load drag. Crossing
all five shapes with all five drags gives 25 hypothetical pumps. Each was
swept in efficiency over the same 384 geometries, and the efficiency at
which the fixed pump wins in half of them (E<sub>50</sub>) was read off.

| | range over 25 cells |
|---|---|
| E<sub>50</sub> | 0.8010 to 0.8300 |
| moved by shape (row means) | 0.0096 |
| moved by drag (column means) | **0.0194** |

With the AZPG's low drag (2.58 kW at 85 L/min) in the set, drag now moves
the threshold twice as much as the map's shape does.

## Leave one family out

For each family, the rules were refitted on the 16 cells that use neither
its shape nor its drag. Then they were asked about the family as it is.

| left out | true E<sub>50</sub> | one number | efficiency + drag | + shape term |
|---|---|---|---|---|
| Casappa | 0.8277 | +0.0130 | +0.0037 | +0.0015 |
| Danfoss | 0.8297 | +0.0141 | +0.0038 | +0.0049 |
| Marzocchi | 0.8193 | +0.0026 | &minus;0.0002 | +0.0069 |
| bench KP30 | 0.8116 | &minus;0.0073 | +0.0006 | &minus;0.0008 |
| Rexroth AZPG | 0.8040 | &minus;0.0166 | &minus;0.0042 | &minus;0.0056 |
| **RMS** | | 0.0119 | **0.0030** | 0.0046 |

Efficiency plus drag is four times as accurate as efficiency alone, and
never off by more than 0.0042. Its slope stays between 0.0162 and 0.0198
per kW whichever family is missing.

A third number for shape, the change in efficiency from 85 to 150 L/min,
fits the 25 cells better. But it predicts a left-out family *worse*.
With five folds that is the signature of overfitting, so the rule stays
at two numbers. Refitted on all 25 cells:

E<sub>50</sub> = 0.824 + 0.018 (kW &minus; 3.57)

where kW is the pump's zero-pressure power at 85 L/min of flow.

## What it means for a builder

Two numbers on a gear pump's data sheet matter: overall efficiency at
150 bar, and the power curve at zero pressure. Nothing else in five
families' maps moves the answer by more than about 0.004.

Six predictions were written before the sweep. Three held: the slope
(0.0179, inside 0.016 to 0.021), the worst held-out error under 0.010,
and two numbers beating one. Three failed: the refit's intercept moved
0.0036 from the old Casappa-only one (the bar was 0.003), the shape
term did not help, and one cell sat 0.0202 from the pooled 0.821
(the bar was 0.020).

Limits: five families are five folds, so these are five errors, not a
distribution. All five are typical catalogue or one-unit curves, and the
drags span only 2.58 to 3.64 kW. A family dragging more than 4 kW or
less than 2 kW would test the slope where no fold has been.

Code: [`gear_pump_five.py`](../../research/heavy-hydraulics/experiments/gear_pump_five.py),
results in [`gear_pump_five_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_five_results.txt),
pre-registered predictions in the [log](../../research/heavy-hydraulics/LOG.md).
