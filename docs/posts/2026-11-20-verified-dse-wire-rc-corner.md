---
title: "Worst-case wires do not move a cheap chip-flow shortlist: SKY130's max-RC corner on 12 designs"
seo_title: "SKY130 max-RC corner vs a mapped-score shortlist"
date: 2026-11-20
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Giving SKY130's slow corner its own max wire RC raises routed delay 2% against mapped delay and leaves a mapped-score shortlist's edge unchanged."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder SWC, maps
every ABC pass sequence and routes only the best eight by a mapped score.
[This morning's run](2026-11-20-verified-dse-where-the-ladder-loses.md) found
the ladder loses where mapped delay says nothing about routed delay.

So far every "corner" in the programme changed only the cell library. The wire
model, ORFS's single `setRC.tcl`, stayed the same at tt, ss and ff. Wires are
exactly what a mapped netlist cannot see. If worst-case wires were going to
break the shortlist anywhere, it would be here.

## What we did

The SKY130 PDK ships OpenRCX extraction rules at three process corners (min,
nom, max) in [open_pdks](https://github.com/RTimothyEdwards/open_pdks). We
scaled each metal layer of ORFS's wire model by the PDK's own max/nominal
ratio. Resistance per micron goes up 28 to 36%, capacitance 4 to 14%, so RC
per unit length rises 41 to 46%. The PDK's nominal resistance matches ORFS's
within 5% on every layer, which is a useful sanity check. The script is
[`derive_rc.py`](../../research/verified-dse/experiments/rc_corner/derive_rc.py).

A quick control showed that today's tool builds do not reproduce the
milestone-143 table we meant to pair with. So we ran both arms fresh with the
same tools: slow-slow cells (ss, 100 °C, 1.60 V) with nominal wires, and the
same cells with max-RC wires. Same clocks, same 120 pass sequences. We
committed seven predictions before the flow started and set a 110-minute stop
rule in advance. 12 of 27 designs finished in both arms (2,975 routed points).

## What came out

| | nominal RC | max RC |
|---|---|---|
| routed / mapped delay (median) | 0.502 | 0.514 |
| tauD, mapped vs routed delay rank (mean) | 0.018 | 0.013 |
| SWC mean regret | 2.59% | 2.73% |
| equal-cost random routing | 7.01% | 7.05% |
| SWC better / worse than random | 9 / 3 | 7 / 5 |

- Routed delay rose against mapped delay on all 12 designs, but only by about
  2%. At the slow corner the cells dominate, even with worst-case wires.
- **The primary prediction failed.** tauD moved by −0.005 (95% interval −0.022
  to +0.011). The wires are not slow enough to change which sequences look
  fast.
- The ladder's edge over random changed by +0.10 points (interval −1.44 to
  +1.84). The two new losses, gtc12r and dot6r, were near-ties before.
- Moving from max to nominal RC changed the routed ranking less (median
  tau-b 0.85) than moving from the earlier tool builds to today's (0.66). The
  build changed Yosys from 0.70 to 0.71 and rebuilt OpenROAD 26Q3.

## What it means

On these small blocks, wire RC is not the knob that moves the cheap rung's
blind spot. The tool build is a bigger knob. That turns tool-version
sensitivity, already a known limit of the programme, into the next thing to
measure for the ladder's edge itself.

Limits: 12 designs, one corner and one utilisation. Routing is global-route
estimated, with scaled wire RC rather than extracted parasitics. Vias stay
nominal. Only the max corner was run. Full numbers:
[`results.txt`](../../research/verified-dse/experiments/rc_corner/results.txt)
and the [research log](../../research/verified-dse/LOG.md).
