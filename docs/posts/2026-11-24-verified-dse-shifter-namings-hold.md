---
title: "Are a chip search's per-design losses real? Rerouting 13 shifters under fresh netlist names"
seo_title: "Rerouting 13 shifters under fresh netlist names"
date: 2026-11-24
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "5,408 SKY130 place-and-route runs: all 13 shallow-amount shifter wins and losses keep their sign under two fresh netlist namings, so they are real."
---

[Earlier today](2026-11-24-verified-dse-tie-rule-shifter-guard.md) the
[verified-dse](../../research/verified-dse/) study re-read 56 blind shifter
designs with a tie rule: when a per-design table comes from one naming of
the mapped netlists, a difference under 4 points is a tie. Renaming nets and
instances changes OpenROAD's placement, and that can move a design's result
that far.

Above 32 gates of logic in front of the shift amount, the clipped ladder
(cheap synthesis rungs first, then routing only the survivors) still won 11
decided designs and lost 1. Below the cut it won 5 and lost 8. But each of
those 13 numbers came from a single naming, so a few might have been luck.

## The test

Milestone 166 reruns all 13 for real. Each design comes from its own earlier
milestone's table. The run maps every synthesis sequence again with the same
Yosys 0.70 build (fetched from the Nix cache by hash). It then places and
routes two fresh random renamings of every mapped netlist at both clocks,
with the same OpenROAD 26Q3 executable: 5,408 runs, about 2 h 20 min on four
cores. Re-placing Yosys's own netlist reproduces the committed rows exactly,
on 52 of 52 control runs and every field. Seven predictions were committed
before the flow ran. All seven held.

| | wins | losses | ties | mean edge (points) |
|---|---|---|---|---|
| original naming | 5 | 8 | 0 | +5.61 |
| fresh naming R2 | 4 | 8 | 1 | +3.80 |
| fresh naming R3 | 4 | 6 | 3 | +3.16 |
| average of three | 5 | 8 | 0 | +4.44 |

Averaged over the three namings, every design keeps its sign and stays
outside the tie band. The 8 losses run from +4.55 to +22.48 points and the
5 wins from -4.38 to -15.52.

## What it says

The shallow-amount results are properties of the designs. One naming still
moves a design's edge by a median 3.5 points, and 4 of the 26 fresh values
land in the tie band. So a single-naming class is wrong about one time in
six here, but none flips sign. The 128-bit funnel shifter is the noisiest
design the programme has measured: +36 points under Yosys's names, +11 and
+14 under the fresh ones. Its loss is real; its headline size was partly a
bad draw.

The mixed picture below the cut survives too, and it is sharper now. Wins
and losses still split 5 to 8 (sign test p = 0.58), and two designs with
exactly 31 gates in front of the amount go opposite ways: avg5 at -8.7
points and sad1b8 at +7.7. Gate depth does not separate them. Routing
randomly below 32 gates gives up five real wins (mean -7.8 points) to
avoid eight real losses (mean +12.1). An earlier diagnosis (milestone 134)
traced the losses to the routed area-delay trade-off, which no count of RTL
structure can see. The next step tests whether a small routed pilot tells
avg5 from sad1b8 before the ladder commits.

Limits: three namings per design, one corner (tt), one utilisation,
global-route estimates, and the 12 decided designs above the cut were not
rerouted. Code, flow table and results:
[`experiments/naming_shifters/`](../../research/verified-dse/experiments/naming_shifters/results.txt).
