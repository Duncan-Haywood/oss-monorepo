---
title: "Spin the gear pump faster or buy a bigger one: the excavator answer stays put, our rule slips"
seo_title: "Overspeeding a gear pump: drag, efficiency and the excavator rule"
date: 2026-11-16
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, load-sensing]
description: "Driving a gear pump 43% faster raised its drag per litre 60% and cut efficiency 0.6 points. The excavator crossing held; our two-number rule missed by 0.006."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a cheap fixed gear pump on an open-centre valve beats a
load-sensing pump on a small excavator's fuel. The answer comes down to one
efficiency, the gear pump's at 150 bar. Below about 0.80 to 0.83, load-sensing
wins in most of the 384 cylinder geometries we read from measured excavator
motion. Where in that band the line falls depends on the pump's no-load drag.
Over eight pump families a two-number rule predicts it:
E<sub>50</sub> = 0.824 + 0.018 (kW &minus; 3.57), with kW the pump's
idle power at 85 L/min.

The eighth family, Bosch Rexroth's AZPF, has a catch. Its largest size gives
only 58.9 L/min at the 2100 r/min the model runs at. Until today the model
priced every bigger pump as that size 28 held: the same efficiency map, the
same drag per litre, as if a larger AZPF existed. No builder can buy one.
The obvious workaround is to drive size 28 faster through a step-up drive.
Rexroth's data sheet rates it to 3000 r/min and draws its curves to that
speed.

## What spinning does to the pump

We read size 28 off the sheet's own curves at the speed that gives each flow.
That speed tops out at 3000 r/min, where the pump gives 84.4 L/min:

| Flow, L/min | Speed, r/min | Efficiency at 150 bar | No-load drag, W per L/min |
|---|---|---|---|
| 58.9 | 2100 | 0.910 | 7.7 |
| 70 | 2496 | 0.907 | 9.7 |
| 85 | 3000 (cap) | 0.904 | 12.3 |

Efficiency barely moves, but drag per litre rises 60%. Leakage, which sets
volumetric efficiency, stays about the same per bar, so it matters less as
flow grows. Churning and viscous losses grow faster than flow. Idle power at
85 L/min goes from 2.61 to 2.99 kW.

## What it does to the answer

Nothing, to four decimal places. The spun AZPF crosses at **0.8075**, the
same as the held one. Two swaps show why. The spun drag on its own pushes the
crossing up by 0.0038. The spun efficiency map on its own pulls it down by
0.0028, because spinning hurts the index point more than the smaller sizes
the fuel optimum also picks. Together they cancel.

The rule only sees the drag. At 2.99 kW it predicts 0.8135, an error of
&minus;0.0060, where the held reading's error was +0.0008. We had registered
a 0.006 limit for that error before the run. The miss lands on that line and
passes it below the fifth decimal, so we count the prediction as refuted.
Four of the six predictions held.

The rule still works. With both short families spun (the AZPF and the AZPN),
the refit is E<sub>50</sub> = 0.8230 + 0.0181 (kW &minus; 3.57). Leaving each
family out in turn gives an RMS error of 0.0035, against 0.0115 for
efficiency alone. But a spun pump is now its worst case. The practical
instruction gets one clause longer: read the drag at the speed the pump will
actually run.

## What we did not price

- The step-up drive's own loss. It would add drag and push the spun crossing
  up. That sweep is next.
- Real units. These are typical catalogue curves.
- The AZPN's cap. It is the 2700 r/min its curves are drawn to, not a rated
  maximum: the mirror we read its sheet from no longer serves the PDF.

Code and output: [`gear_pump_spin.py`](../../research/heavy-hydraulics/experiments/gear_pump_spin.py)
and [`gear_pump_spin_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_spin_results.txt).
The registered predictions and their outcome are in the
[research log](../../research/heavy-hydraulics/LOG.md), milestone 7b.
