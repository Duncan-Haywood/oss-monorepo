---
title: "Chip design search: where a shifter's amount comes from decides whether a cheap ranking works"
seo_title: "Shifter shift-amount logic decides if a cheap chip-flow ranking works"
date: 2026-11-13
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Three shifter families run blind through Yosys and OpenROAD: a cheap ranking wins when a popcount drives the shift amount, and loses behind one adder."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences (Yosys, ABC and OpenROAD on SKY130). It asks
when a cheap mapped-netlist score can stand in for a routed result. Our rule
ranks candidates by a clipped mapped score and routes the best 8. The rule fails
on some shifters. In the [last step](2026-11-13-verified-dse-shifter-guard-fails-blind.md)
a check for shift operators in the RTL got both kinds wrong. It missed a barrel
shifter built from muxes, and it flagged a leading-zero normaliser, where the
ranking wins outright.

Our explanation was that the source of the shift amount matters. When the amount
comes straight from an input, the shifter's delay is mostly wire, and the mapped
score cannot see it. When the amount comes out of deep logic, the critical path
runs through gates the mapped score does see.

So we measured that directly. `amount_depth` is the longest chain of word-level
cells between a module input and the shift amount. One Yosys elaboration gives
it in seconds. Every wide shifter we had already run has depth 0, except the
normalisers (190 to 382). The old data therefore could not say where to draw the
line. Before any flow ran, we committed two candidate cuts and seven
predictions. "Route randomly when the amount comes from pins" (depth under 1)
was our main guess. "Route randomly when it is under 8 cells deep" was the
alternative. We then built three shifter families that no table had run:

- `x >> (a + b)`: one adder in front of the amount (depth 1);
- `x >> |ea - eb|`: the alignment step of a floating-point adder (depth 2);
- `x << popcount(m)`: the amount is a population count (depth 63 and 127).

That meant 1,440 flow runs at 64 and 128 bits and two clocks, about 55 minutes
on 4 cores.

| family | cells | cheap ranking (no guard) | "under 8 cells" guard | equal-cost random |
|---|---|---|---|---|
| adder-driven shift | 4 | 8.60% | 1.69% | 1.69% |
| exponent-difference align | 4 | 13.29% | 6.98% | 6.98% |
| popcount-driven shift | 4 | 0.00% | 0.00% | 1.33% |
| all 12 blind cells | 12 | 7.30% | 2.89% | 3.34% |

Four predictions held and three failed.

**Deep logic in front of the amount: the ranking wins.** On all four popcount
cells the cheap ranking finds the routed-best recipe (0.00% regret). Random
routing of the same cost is at 0.92% to 1.81%. This is the normaliser's result
again, on a family it was not chosen from.

**A little logic is not enough.** We expected the floating-point alignment step
to behave like the normaliser. It did not. On the 128-bit version the ranking
has 21% regret at both clocks, against 8.4% and 8.7% for random routing. The
adder-driven shifter fails too (23% at the tight clock on 128 bits, against
1.8%). So "the amount comes from a pin" was too literal. A shifter stays
wire-dominated with a few cells in front of its amount.

**The guard that held was the alternative.** "Route randomly on a 64-bit-plus
shifter whose amount is under 8 word-level cells deep" is better than random in
4 cells and worse in none. Its blind regret is 2.89%, against 3.34% for random
routing and 7.30% for the unguarded rule. With 12 cells that is suggestive, not
settled (sign test p = 0.125). We have not tested where between depth 2 and 63
the line falls.

**For someone running a flow today:** before trusting a mapped-netlist ranking
on a design with a wide shifter, look at what drives the shift amount. If it is
an input, an adder or a short compare-and-select, route a random sample. If it
is a counter or a priority encoder, the clipped ranking has reached 0.00%
regret in all 12 such cells we have run (8 normaliser, 4 popcount).

Code, data and the full table:
[`experiments/amount_depth/`](../../research/verified-dse/experiments/amount_depth/results.txt).
Produced with AI assistance (Claude Code); results are from one tool version,
one corner and global-route estimates.
