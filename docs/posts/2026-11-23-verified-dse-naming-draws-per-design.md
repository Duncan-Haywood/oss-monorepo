---
title: "How big must a per-design result be to survive netlist naming noise? About 3 points"
seo_title: "Netlist naming noise: which per-design chip results hold"
date: 2026-11-23
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "200 per-point naming draws over 27 SKY130 designs: a design's search edge moves about 1 point, and edges larger than 3 points never flip sign."
---

The [verified-dse](../../research/verified-dse/) study compares two ways of
spending a place-and-route budget on synthesis recipes for one chip block. A
cheap-score "ladder" picks what to route, and the alternative routes recipes
at random. [This morning's run](2026-11-23-verified-dse-naming-ladder-27-designs.md)
showed that the ladder's average edge, -4.37 points of regret on 27 SKY130
designs, survives OpenROAD's sensitivity to netlist names. It also showed
that one renaming moves a single design's edge by about 2.4 points. That
leaves the paper with a question about its per-design claims, the "the
ladder loses on design X" sentences: which of them are real?

## The test

A search routes each candidate once, so the naming noise it meets is per
point, not per table. This run reused the routed results already on disk:
every recipe of every design had been placed and routed under three namings
(Yosys's, a canonical form and a random renaming). In each of 200 draws,
every point took its routed result from one of the three at random, and the
edge was recomputed. No new place-and-route ran, and the six predictions
were committed before the script first ran.

## What it found

| | Result |
|---|---|
| Typical spread of one design's edge (median sd) | **1.02 points** (0.54 to 2.19) |
| Spread of the 27-design mean | sd 0.22; every draw between -4.78 and -3.62 |
| Ladder better than random, per draw | 21 to 25 of 27 designs |
| Largest edge that flips sign in more than 5% of draws | 2.08 points |
| Designs flipping in more than 20% of draws | 2 (gtc12r, dot6r), both within a point of zero |

Five predictions held. The primary held narrowly: the bound was 1.0 to 2.5
points and the result was 1.02. One prediction was refuted. I expected at
least four designs to flip sign often, and only two did.

## What it means

Per-design results larger than about 3 points are properties of the design.
No design above that flipped sign in any of the 200 draws. The ladder's
clear loss on csum6, 10.6 points, is real. Its 0.9-point loss on clamp2r,
which flips in 12% of draws, is a tie. For anyone comparing two netlists
through OpenROAD, one routed run per candidate is enough to call a gap of
3 points or more, while a gap of 1 or 2 points needs several namings or a
canonical form before it means anything.

Caveats: two of the three namings are constructed, so more random namings
could spread wider. The number of namings needed for a near-zero design is
extrapolated, not measured. The study uses one corner and global-route
estimates.

Code, draws and results:
[`experiments/naming_draws/`](../../research/verified-dse/experiments/naming_draws/results.txt).
Written with AI assistance (Claude Code); every number is from the committed
results file.
