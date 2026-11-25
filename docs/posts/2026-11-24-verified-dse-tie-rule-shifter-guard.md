---
title: "Which chip-search wins survive netlist naming noise? Re-reading 56 blind shifter designs"
seo_title: "Netlist naming noise and 56 blind shifter designs"
date: 2026-11-24
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "A 4-point tie rule applied to 56 SKY130 shifter designs: the ladder still wins 11 of 12 above 32 gates, and below the cut wins and losses split 5 to 8."
---

[This morning's run](2026-11-24-verified-dse-five-namings-near-zero.md) on the
[verified-dse](../../research/verified-dse/) study ended with a rule. When a
per-design table comes from one naming of the mapped netlists, a difference
under about 4 points is a tie, because renaming every net and instance can
move a design's edge that far.

Most of the study's claims about shifters were read off tables like that.
Milestones 118 to 133 ran blind tests on new shifter families and found that
the clipped ladder (cheap synthesis rungs first, then routing only the
survivors) loses to plain random routing when the shift amount sits behind
few gates, and wins when it sits behind many. The gate-depth guard SWG(32)
grew out of this: below 32 gates of logic in front of the amount, it routes
randomly.

## The re-read

Milestone 165 does not reroute anything. It reads the blind table of each of
the ten milestones again: 64 designs and 128 cells, 56 of the designs with a
known gate depth. It gives each design one edge, d = SWC regret minus random
regret averaged over the design's two clocks, and labels it a win, a loss or
a tie at 4 points. Six predictions were committed before the script first
ran. Four held.

| amount gate depth | decided wins | decided losses | ties | sign test |
|---|---|---|---|---|
| 32 or more (30 designs) | 11 | 1 | 18 | p = 0.006 |
| under 32 (26 designs) | 5 | 8 | 13 | p = 0.58 |

The primary prediction held: 31 of the 56 designs tie. Twelve of those 31
tie because SWC never took the ladder branch, so its result equals random
routing exactly. That still leaves 19 ties among the 44 designs with a
nonzero edge.

## What changes

The evidence above the cut holds. Once the amount sits behind 32 or more
gates, the ladder wins 11 of the 12 designs whose edge is bigger than naming
noise can explain. Below the cut, the evidence for a rule is gone: decided
wins and losses are close to even. What makes the ladder costly there is a
few large losses: a 128-bit funnel shifter at +36 points, xor8 at +17,
addsh128 at +14, fpalign128 at +13. The mean edge is +3.18 points below the
cut and -3.25 above it.

So the guard is still worth having, but for a different reason. Routing
randomly below 32 gates is insurance against rare large losses. It is not
avoiding a loss that reliably happens there. The decided designs also don't
pin the cut down: any cut from 19 to 32 gates misplaces 5 or 6 of them.

The rule has limits. It came from a different tool build and corner (build
B, ss) than these tables (build A), so applying it here assumes the naming
noise is about the same size. Each side of the cut has only 13 decided
designs at most. The next step that would settle the shallow side is two
more namings of those 13 designs, about three hours of place-and-route.

Code and tables:
[`experiments/tie_rule/`](../../research/verified-dse/experiments/tie_rule/results.txt).
