---
title: "Chip design search: the cheap ranking starts to work at about 32 gates in front of a shift amount"
seo_title: "Where a cheap chip ranking starts to work on wide shifters: 32 gates"
date: 2026-11-14
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Seven blind shifters run through Yosys and OpenROAD place the line at 31 to 33 gates in front of the shift amount, below the 36 we had registered."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences (Yosys, ABC and OpenROAD on SKY130). Its practical
rule ranks candidates by a clipped mapped-netlist score and routes only the best
8. On wide shifters that ranking only works when enough logic feeds the shift
amount. The [last step](2026-11-14-verified-dse-gates-not-cells.md) showed the
logic should be counted in gates, not operations. It fixed a guard: route a
random sample instead when fewer than 36 AND/NOT gates feed the amount. But 36
was just the midpoint of a gap. On the shifters we had run, the ranking lost at
30 gates or fewer and won at 41 or more, with nothing in between.

This step filled the gap. Before any flow ran, we committed seven predictions
and seven new shifters from three families. We tuned the field widths only by
counting gates, which takes seconds and runs no flow, so that the amounts landed
at 31 to 41 gates:

| design | gates | ranking alone | 36-gate guard | equal-cost random |
|---|---|---|---|---|
| \|a − b\|, 8-bit | 31 | 13.87% | 4.45% | 4.45% |
| max of three 5-bit fields | 33 | 0.00% | 5.24% | 5.24% |
| one 9-bit saturating add | 35 | 0.00% | 4.97% | 4.97% |
| max of three 6-bit fields | 36 | 0.00% | 0.00% | 21.81% |
| the same, 64-bit shifter | 36 | 3.84% | 3.84% | 3.84% |
| two \|a − b\| terms, 5-bit | 40 | 1.38% | 1.38% | 3.37% |
| two saturating 5-bit adds | 41 | 0.00% | 0.00% | 13.08% |

Each figure is regret averaged over two clock targets: how far the chosen
recipe's routed area × delay is from the best of 103 recipes that completed.
The 1,680 flow runs took about 45 minutes on 4 cores.

**Six of seven predictions held. The one that failed matters most.** We
predicted the ranking would still lose at 33 gates. It found the routed-best
recipe at both clocks. Every 128-bit cell from 33 gates up went the same way:
0.00% to 1.59% regret, against 3.25% to 22.73% for random routing. At 31 gates
the ranking lost at the tight clock, 27.7% against 4.3%. The line sits
between 31 and 33 gates.

**So the registered guard is too cautious, but it is safe.** The 36-gate
guard sent the 33- and 35-gate designs to random routing and gave up about 5
points on each. It still beat random routing in 6 cells and lost in none
(2.84% against 8.11%). Checked after the fact, a 32-gate threshold would have
had 1.38%. Over the 50 blind cells of the last four steps, the 36-gate guard
has 2.41% against 5.11% for random routing. It is better in 23 cells and worse
in 1.

**The width question is still open.** We put the same 36-gate amount in front
of a 64-bit shifter, to see whether the line moves with width. Routing that
design costs only 2.6 mapped scores against 3.8 at 128 bits. That is below the
rule's cost threshold of 3, so every policy routes it randomly and the cell
says nothing about the cut.

**For someone running a flow today:** count the gates that feed a wide
shifter's amount (`abc -g AND`, then `ltp`, takes seconds). Under about 31,
route a random sample. From about 33 up, the clipped ranking found the
routed-best recipe or came within 1.6% of it on every 128-bit cell in this
test. One earlier cell still goes against it: a 32-bit sum, 118 gates deep,
at the tight clock (12.7% against 5.5%). The next step fixes 32 as the
threshold and tests it blind.

Code, data and the full table:
[`experiments/amount_place/`](../../research/verified-dse/experiments/amount_place/results.txt).
Produced with AI assistance (Claude Code). Results come from one tool version,
one corner and global-route estimates.
