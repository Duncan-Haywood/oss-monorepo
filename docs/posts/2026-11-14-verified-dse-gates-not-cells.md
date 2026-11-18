---
title: "Chip design search: count the gates in front of a shift amount, not the operations"
seo_title: "Gate depth before a shift amount decides if a cheap chip ranking works"
date: 2026-11-14
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Six 128-bit shifters run blind through Yosys and OpenROAD: counting gates before the shift amount beats counting operations, 1.28% regret vs 5.33%."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences (Yosys, ABC and OpenROAD on SKY130). Its practical
rule ranks candidates by a clipped mapped-netlist score and routes only the best
8. That rule fails on some wide shifters. The
[last step](2026-11-14-verified-dse-amount-depth-cut.md) found that it works
once a few operations sit in front of the shift amount. It put the line between
2 and 4 word-level operations, and warned that an operation count ignores
width: an 8-bit subtract and a 1-bit increment each count as one.

So this step counted gates as well. We cut each design down to the logic that
feeds the shift amount and mapped it to two-input AND and NOT gates. The gate
depth is the longest path through those gates. On every shifter we had already
run, the two counts drew the same line: the ranking lost at 0 to 30 gates and
won from 41 up. A test on those designs could not tell the two rules apart.

We built designs that could. Before any flow ran, we committed seven predictions
and six new 128-bit shifters from three families:

| design | operations | gates | ranking alone | operation guard | gate guard | equal-cost random |
|---|---|---|---|---|---|---|
| xor of 4 fields | 3 | 7 | 1.79% | 1.79% | 0.57% | 0.57% |
| xor of 8 fields | 7 | 15 | 16.89% | 16.89% | 0.02% | 0.02% |
| 4-term sum, 7-bit | 3 | 43 | 0.73% | 0.73% | 0.73% | 1.68% |
| 3-term sum, 32-bit | 2 | 118 | 6.37% | 5.76% | 6.37% | 5.76% |
| 2 chained 12-bit multiplies | 2 | 159 | 0.00% | 6.80% | 0.00% | 6.80% |
| 3 chained 7-bit multiplies | 3 | 166 | 0.00% | 0.00% | 0.00% | 8.90% |

Each figure is regret averaged over two clock targets: how far the chosen
recipe's routed area × delay is from the best of about 103 that completed. The
1,440 flow runs took 38 minutes on 4 cores. The operation guard routes randomly
under 3 operations, the gate guard under 36 gates.

**All seven predictions held.** The gate guard has 1.28% regret on the 12 blind
cells, against 5.33% for the operation guard and 3.95% for random routing. It is
better than random in 7 cells and worse in 1 (sign test p = 0.07, so not yet
significant on this step alone).

**An xor chain is many operations and few gates.** Seven xors in a row look deep
to an operation count. ABC balances them into a tree 15 gates deep, so the
amount is close to a pin. The ranking then lost badly: 16.9% regret where random
routing had 0.02%.

**A multiply is one operation and many gates.** Two chained 12-bit multiplies
are only 2 operations deep, so the operation guard sent them to random routing.
In gates they are 159 deep, and the ranking found the routed-best recipe at both
clocks.

**One cell goes against it.** On the 32-bit sum at the tight clock the ranking
had 12.74% against 5.52% for random. We don't know why yet. It is not the
low-slack failure seen before.

**Across three blind tests.** Over the 36 blind cells of this step and the two
before it, the gate guard has 2.25% regret against 3.94% for random routing. It
is better in 17 cells and worse in 1. The 36-gate threshold is the midpoint of
the gap in the data we had already seen, so its exact value is only known to
lie between 30 and 41.

**For someone running a flow today:** before trusting a mapped-netlist ranking
on a wide shifter, count the gates that feed its shift amount (`abc -g AND`,
then `ltp`, takes seconds). Under about 30, route a random sample. Above about
40, the clipped ranking found the routed-best recipe on every multiply,
popcount, normaliser and xor-add chain we have run. The plain sums are the
exception: 0.73% on the 7-bit one, and the 32-bit cell above.

Code, data and the full table:
[`experiments/amount_cut/`](../../research/verified-dse/experiments/amount_cut/results.txt).
Produced with AI assistance (Claude Code). Results come from one tool version,
one corner and global-route estimates.
