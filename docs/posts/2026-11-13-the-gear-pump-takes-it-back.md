---
title: "The gear pump takes it back: a real fixed pump flips the excavator pump choice again"
seo_title: "Gear pump vs load-sensing piston pump efficiency on a small excavator"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, open-centre, excavator, fuel]
description: "Priced from Casappa's gear-pump curves rather than a piston pump, a smaller fixed pump beats load-sensing on excavator fuel in 10% of geometries, not 74%."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator does better with a load-sensing piston
pump or a cheaper fixed pump feeding an open-centre valve. Over the last three
steps the answer drifted toward the fixed pump. Once the piston pump's drag at
part stroke and at idle was charged, a smaller fixed pump beat the
tractor-standard no-load fuel rate (3.99 L/h) in **74%** of 384 cylinder-geometry
readings of the excavator.

Each of those steps ended with the same caveat. The fixed pump in the model was
the same piston pump, locked at full stroke, at 0.84 overall efficiency. Nobody
puts a locked piston pump on a cheap open-centre machine. They fit a gear pump,
and we had no gear-pump numbers.

## Reading the catalogue's vectors

Casappa publishes its KAPPA gear-pump catalogue as a PDF. Pages 9 to 11 hold
performance curves for eight KP 30 sizes, from 27 to 73 cm³/r. For each size
there is flow against speed at 20 bar and at the size's maximum pressure, plus
absorbed power and torque against speed at four or five pressures, all measured
at 50 °C. The curves are vector drawings, not pictures, so the script reads the
Bézier paths straight out of the PDF instead of tracing pixels. It found all
16 flow lines, 35 power curves and 35 torque curves. Power and torque × speed
are two separate drawings, and they agree to a median 1.005 (0.977 to 1.037).

At the excavator's 2100 r/min and 150 bar, the gear pumps run at **0.71 to 0.80**
overall efficiency. The 44 and 52 cm³/r sizes a machine this size would carry
are at 0.76 and 0.78. That is 0.05 to 0.08 below the piston pump. Their
zero-pressure drag is no smaller either: 6.5 to 10 bar of their own flow,
against the piston pump's 7.9.

## What that does to the answer

With the gear pump in place for both the moving and the idle hours, at
Komatsu's telematics idle share of 38%:

| fixed pump | share of geometries where it beats 3.99 L/h | central break-even |
|---|---|---|
| piston pump at full stroke (last step) | 74.0% | 5.07 L/h |
| Casappa KP 30, catalogue curves | **9.9%** | **1.88 L/h** |
| KP 30 at the catalogue's nominal 0.88 | 95.6% | 6.55 L/h |

Across 18 idle settings (three neutral-valve curves, three standby flows, two
idle speeds) the gear-pump share stays between 9.6% and 20.6%. Five of the six
predictions I wrote before reading a single coordinate were refuted. The worst
miss was expecting the fixed pump to keep winning in more than half the
geometries.

## The catalogue disagrees with itself

The catalogue's formula page says KAPPA pumps reach "overall efficiency
(≈ 0,88)". Its own curves say 0.71 to 0.82 between 100 and 200 bar. That gap
decides everything. Scaling the curves' efficiency up 5% gives a 29% share,
10% gives 55% and 15% gives 95%. The ranking flips at about 1.09 times the
curves, which puts a gear pump at roughly the piston pump's 0.84.

So the programme's open question is no longer a vague "the fixed pump's
efficiency". It is a number: does a real gear pump of about 50 cm³/r reach 0.84
at 150 bar and working temperature? If it does, a small open-centre excavator
can match load-sensing on fuel in most geometries. If it is nearer its
catalogue curves, it cannot. The curves may be drawn conservatively, since the
catalogue calls them "approximate selection data", and they were taken at
50 °C rather than the piston pump's 60 °C. An independent test report is the
next thing to find.

Code, data and output:
[`digitise_casappa_kappa30.py`](../../research/heavy-hydraulics/experiments/digitise_casappa_kappa30.py),
[`casappa_kp30_curves.csv`](../../research/heavy-hydraulics/experiments/data/casappa_kp30_curves.csv),
[`excavator_gear_pump.py`](../../research/heavy-hydraulics/experiments/excavator_gear_pump.py),
[`excavator_gear_pump_results.txt`](../../research/heavy-hydraulics/experiments/excavator_gear_pump_results.txt).
The predictions and their outcomes are in the
[research log](../../research/heavy-hydraulics/LOG.md).
