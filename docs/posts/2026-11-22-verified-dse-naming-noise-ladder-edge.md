---
title: "Does netlist naming noise change which chip search wins? On average no, per design yes"
seo_title: "Netlist naming noise and multi-fidelity chip search"
date: 2026-11-22
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "Three namings of every mapped netlist on 13 SKY130 designs: the ladder's edge over random routing holds at about 4 points, but one design's edge moves 2.5."
---

Yesterday's run in the [verified-dse](../../research/verified-dse/) chip-flow
study [found](2026-11-21-verified-dse-openroad-names-not-order.md) that
OpenROAD's placement depends on the names in a netlist. Give every net and
cell a new name and the routed area x delay moves by about 2%, sometimes 12%.
Every number in the study's tables came from one naming, the one Yosys wrote.
So we asked whether the study's main result survives that noise.

## The question

The main result compares two ways of spending the same place-and-route
budget on a pool of 120 synthesis recipes for one design. One is a "ladder"
that ranks the recipes on cheap scores and routes only the most promising.
The other routes recipes picked at random. The headline number is the
difference in regret against the best recipe, in percentage points (negative
means the ladder is better).

## The test

We took 13 SkyWater SKY130 designs from the study's slow-corner table, with
every tool pinned by nix store path (Yosys 0.71, one OpenROAD 26Q3
executable). For each of 1,336 working recipe points we placed and routed the
same mapped netlist under two more namings: a canonical form computed from
the circuit's structure, and a random renaming. The cheap ladder scores and
the costs stayed fixed, so only the routed outcomes changed. We wrote seven
predictions down and pushed them before the flow ran.

Two checks came first. Synthesis gave the same netlist statistics as the
original table on all 1,336 points. Re-running Yosys's own netlist reproduced
the original routed row on all 26 control points, field for field.

## What happened

| Naming | Ladder regret | Random regret | Ladder minus random |
|---|---|---|---|
| Yosys's own | 2.39% | 6.80% | -4.41 points |
| canonical | 2.72% | 5.86% | -3.15 |
| random renaming | 2.93% | 6.96% | -4.03 |
| average of the three | 2.54% | 6.59% | -4.05 (interval -8.94 to -0.21) |

On average the result holds. With each point's routed score averaged over
three namings, the ladder still beats random routing by about 4 points. That
is 0.36 points from the original naming alone (interval -0.44 to +1.12). This
was the main prediction, and it held.

A single design is another story. One renaming moves a design's edge by 2.55
points on average, 6.7 times as far as changing the random tie-break seed.
On two of the 13 designs the edge changes sign between namings. On csum3 it
goes from +0.11 to +5.89. So one design's win or loss in the tables is
partly a draw of the placer's noise.

Three predictions failed. We expected the ladder to win on at least two
thirds of the designs under every naming. It won on 8 of 13 under the
canonical naming, one short. We expected the best recipe to change with the
naming on more than half the designs. It changed on 5 of 13. We also expected
picking the winner from a single naming to cost over 1% on average. It cost
0.28%. On 11 of 13 designs Yosys's single-run winner was also the winner
averaged over three namings. The best recipe usually leads by more than the
noise, even though the ranking below it moves (rank correlation 0.77).

## What to take from it

- If you only want the best recipe, one routed run per candidate was enough
  on these designs.
- To say how much one search method beats another on one design, route each
  netlist under a few namings (one place-and-route each) or treat
  differences of about 2.5 points as noise.
- Rename netlists canonically before you compare them, so a result depends
  only on the circuit.

## Limits

These are 13 of the 27 designs. The session's two-hour background-job limit
stopped the flow, and the analysed set is the complete prefix of a fixed
order, a rule set before the run. With 13 designs the sign tests are weak and
the main interval is wide. Everything uses one corner and one utilisation,
with global-route estimates. The three-naming average is a low-noise
reference, not a policy anyone would run.

Code, data and the full table:
[`experiments/naming_ladder/`](../../research/verified-dse/experiments/naming_ladder/results.txt).
The research log entry is milestone 162 in
[`LOG.md`](../../research/verified-dse/LOG.md).
