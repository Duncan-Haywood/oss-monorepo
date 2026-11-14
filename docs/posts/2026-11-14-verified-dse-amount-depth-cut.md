---
title: "Chip design search: four cells of logic in front of a shift amount are enough for a cheap ranking to work"
seo_title: "How much logic before a shift amount lets a cheap chip ranking work"
date: 2026-11-14
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Six new 128-bit shifters run blind through Yosys and OpenROAD: a cheap ranking wins once 4 or more cells feed the shift amount, not 8 as we guessed."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences (Yosys, ABC and OpenROAD on SKY130). Its practical
rule ranks candidates by a clipped mapped-netlist score and routes only the best
8. That rule fails on some wide shifters. In the
[last step](2026-11-13-verified-dse-shift-amount-source.md) we found it depends on
what drives the shift amount. Behind one adder or an exponent difference (1 or 2
word-level cells) the ranking loses to random routing. Behind a 63-cell counter
it finds the best recipe every time. We had registered a guard: "route randomly
on a wide shifter whose amount is under 8 cells deep". Nothing we had run sat
between 2 and 63, so the 8 was a guess.

This step tested that guess from both sides. Before any flow ran, we committed
seven predictions and three new 128-bit shifter families, each with one shallow
and one deep version:

- `x >> s`, where s goes through K rounds of `(s ^ b) + c` (depth 4 and 16);
- `x << popcount(m)` over a 6-bit or a 24-bit mask (depth 5 and 23);
- `x >>` a lane picked by the first set bit of a 4- or 8-bit request (depth 10 and 22).

We ran 1,440 flows, about 20 minutes on 4 cores. Regret is how far the chosen
recipe's routed area × delay is from the best of the 103 that completed:

| design | amount depth | cheap ranking | "under 8" guard | equal-cost random |
|---|---|---|---|---|
| xor-add chain, 2 rounds | 4 | 0.00% | 3.11% | 3.11% |
| xor-add chain, 8 rounds | 16 | 0.00% | 0.00% | 5.59% |
| popcount of 24 bits | 23 | 0.00% | 0.00% | 3.13% |
| popcount of 6 bits, both lane selects | 5 to 22 | below the cost threshold: every rule routes randomly | | |

Four predictions held and three failed.

**The ranking won every cell where it ran.** On all 6 cells where the rule
uses its ranking, it found the routed-best recipe. That includes the
depth-4 chain, which our guard flagged and sent to random routing. The guard
cost 3.11 points there. We had predicted the opposite. The other 6 cells were
cheap enough to route that the rule samples at random anyway, so they tell us
nothing about the guard.

**The guard still beats random routing across both tests.** Over the 24 blind
cells of this step and the last, the "under 8" guard is better than random in 8
cells and worse in none (sign test p = 0.008). Its regret is 2.99%, against 3.94%
for random and 4.93% for the unguarded ranking.

**The line is lower than we drew it.** On the 14 cells where the ranking ran,
it lost all 4 with an amount 1 or 2 cells deep and won all 10 with 4 or more.
A guard at 3 would have scored 2.73%. We chose that after reading the table, so
it is a hypothesis for the next blind test, not a result. One caution: the cell
count ignores width. Two rounds of 7-bit xor and add may not be much deeper in
gates than an 8-bit subtract, compare and select.

**The cost threshold matters too.** Below it the rule samples at random, and
that turned out to be the right call. On the depth-10 lane select and the 6-bit
popcount at the relaxed clock, the clipped ranking alone would have had 23.69%
and 27.43% regret. The unclipped ranking was at 0.00% on both. So amount depth
says when the ranking can be trusted on shifters that are expensive to route,
not on every shifter.

**For someone running a flow today:** when a wide shifter's amount comes
straight from an input or through one or two operations, route a random sample.
When a counter, a priority encoder or a few chained operations produce the
amount, and routing is expensive enough for the rule to rank, the clipped
ranking found the routed-best recipe in all 10 such cells of the last two tests.

Code, data and the full table:
[`experiments/amount_threshold/`](../../research/verified-dse/experiments/amount_threshold/results.txt).
Produced with AI assistance (Claude Code). Results come from one tool version,
one corner and global-route estimates.
