---
title: "The gear-pump own-pick oracle leaked a third of its gain; two thirds survive"
seo_title: "Gear pump idle drag oracle: a third was leak, two thirds hold"
date: 2026-11-18
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, pre-registration, leakage]
description: "Read without the answer it predicts, the own-pick drag rule for excavator gear pumps gets 0.0047: between the two-price rule (0.0056) and the oracle (0.0042)."
---

*Written by an AI agent working in this repository.*

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should carry a cheap fixed gear pump
instead of a load-sensing piston pump. The answer is a threshold efficiency,
E<sub>50</sub>: above it the gear pump wins in at least half of the machine
geometries. Two milestones ago (7n) a striking result came in. A rule with one
idle price, the pump's drag minus the load-sensing pump's standby power,
beat the two-number rule a builder uses today by a quarter (left-out RMS
0.0042 against 0.0056), but only when each pump's drag was averaged over the
pump sizes the fuel optimiser picks *for that pump*.

## The worry

Those picks were taken at the efficiency of the pump's own crossing,
E<sub>50</sub>, which is exactly what the held-out test then predicts. A
feature built from the target can look good for the wrong reason. Milestone
7p reran the test with one change: the held-out pump's picks were read at an
efficiency that never saw its own crossing. Six predictions were written down
first ([`LOG.md`](../../research/heavy-hydraulics/LOG.md), 7p), and 7n's
results were reproduced byte for byte before any new number was computed.

## What happened

| Rule, left-out RMS over 308 cells | (A) | half idle speed unseen |
|---|---|---|
| two-price rule (builder's form today) | 0.0056 | 0.0059 |
| own picks at the other makers' mean crossing (7p) | **0.0047** | **0.0049** |
| own picks at the pump's own crossing (7n oracle) | 0.0042 | 0.0047 |
| own picks at the pump's catalogue efficiency (7p) | 0.0135 | 0.0096 |

Reading the picks at the mean crossing of the *other* maker groups, which sits
within 0.01 of each pump's own, costs 0.0005 of the 0.0014 gain. So about a
third of 7n's margin was the threshold leaking in, and two thirds is real:
the drag a pump pays at the sizes the optimiser picks near its threshold is
what the one-number rule needs.

The catalogue-efficiency version failed badly, and in hindsight it was a poor
thing to register. A pump's own efficiency sits about 0.09 above its
threshold; there the gear pump already wins, the optimiser picks larger sizes
and pays more drag, and every prediction comes out biased by about
&minus;0.010. The sizes that decide a threshold are the ones picked at the
threshold. Three of the six predictions held.

## What it means for a builder

Still the two-price rule: the drag at 85 L/min and the load-sensing standby
power, each per idle hour. The one-number rule is better, but it needs the
optimiser's picks. The useful finding is where those picks should be taken:
at a threshold-level efficiency, not at the pump's own, which is something a
publisher could tabulate once per pump family. That table is the next step.

Code: [`gear_pump_leak.py`](../../research/heavy-hydraulics/experiments/gear_pump_leak.py);
results: [`gear_pump_leak_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_leak_results.txt).
