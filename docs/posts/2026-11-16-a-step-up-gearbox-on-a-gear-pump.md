---
title: "A step-up gearbox on a gear pump costs 0.14 kW, and it fools our pump rule"
seo_title: "Step-up gearbox on a hydraulic gear pump: what the drive loss does"
date: 2026-11-16
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, gearbox, reproducibility]
description: "Driving a small gear pump faster through a spur-gear step-up drive barely costs energy, but it moves our excavator pump rule's answer the wrong way."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should carry a cheap fixed gear pump
instead of a load-sensing piston pump. Over eight gear-pump families it has
built a two-number rule. You read a pump's efficiency at 85 L/min and its
idle drag in kW, and the rule tells you the efficiency at which the gear
pump wins on fuel in half of 384 measured cylinder geometries.

This morning's step (7b) asked what happens when a pump family is too small.
A builder would spin its largest pump faster, here Rexroth's AZPF size 28
driven from 2100 to 3000 r/min. The crossing did not move, but the rule's
error grew from 0.0008 to 0.0060. That step priced the gearbox doing the
spinning as free. This step (7c) prices it.

## Where the loss comes from

ISO/TR 14179-1 is not open, so we used a measured, public source: NASA
Technical Paper 1622 (Anderson and Loewenthal, 1980). Its worked example,
one spur mesh on ball bearings at 2000 r/min and 56.79 kW in, loses
0.3776 kW, so the system is **99.34%** efficient at full load. The paper
also says the loss with no load can reach **65%** of the full-load loss,
because rolling, windage and bearing losses hardly depend on load. A
mobile-machine drive is probably lossier than NASA's test rig, so we swept
full-load efficiency down to 98% (our own lower bound, not a sourced figure)
and the no-load share from 0 to 0.65. The predictions were committed before
the code ran.

## What it found

| | AZPF, lossless spin | AZPF, geared | AZPN, lossless spin | AZPN, geared |
|---|---|---|---|---|
| idle kW at 85 L/min | 2.99 | 3.13 | 2.61 | 2.73 |
| crossing E<sub>50</sub> | 0.8075 | 0.8094 | 0.8031 | 0.7988 |
| rule error | −0.0060 | −0.0066 | −0.0036 | −0.0101 |

The geared columns use the sourced point (99.34%, no-load share 0.65).

The drive itself is cheap. On the AZPF it loses 136 W with no load and
187 W at 150 bar. The catch is in where that loss lands. The drive is only
fitted above the family's largest size, so it lowers efficiency at the
85 L/min reading point without touching the smaller pumps the fuel optimum
often picks. We split the drive's effect into its two halves. On the AZPN
the efficiency-map half moves the crossing −0.0048 and the drag half
+0.0006. The rule reads only the drag, so it expects a later crossing and
gets an earlier one. With a 98% drive the AZPN miss grows to 0.026.

Across all eight families with both short families geared, the rule still
predicts a left-out family more than twice as well as efficiency
alone (RMS 0.0051 against 0.0121). Three of the six registered predictions
held. The three that failed point the same way: the drive pulls the
crossing earlier, so the rule's misses come out bigger than we expected.

## What a builder should take from it

If you get extra flow from a gear pump through a step-up drive, read the
rule with the pump's own efficiency and drag, without the drive, and add
the drive's loss to the fuel bill directly. Don't fold the drive into the
pump and then trust the rule. The limits: we modelled one spur mesh scaled
to the pump's rating, not a measured PTO gearbox, and the pump curves are
typical catalogue curves.

Code and full results:
[`experiments/gear_pump_stepup.py`](../../research/heavy-hydraulics/experiments/gear_pump_stepup.py),
[`gear_pump_stepup_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_stepup_results.txt);
the registered predictions and outcome are in the
[log](../../research/heavy-hydraulics/LOG.md), milestone 7c.
