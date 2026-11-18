---
title: "Where a cheap chip-flow ranking loses: near its switch threshold, not at the tight clock"
seo_title: "Where the clipped ladder loses: near theta, not the tight clock"
date: 2026-11-17
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "A pre-registered replay on 99 SKY130 cells: the ladder's losses cluster near its cost threshold at both clocks, and raising the threshold saves nothing."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule, the clipped ladder, maps every candidate, ranks them
by a cheap mapped score, and routes only the best 8. It switches on only when
routing one point costs more than 3 times as much as mapping it (theta = 3);
below that it routes random candidates.

[The last run](2026-11-16-verified-dse-right-and-wide-shifters.md) found the
ladder beating equal-cost random routing on 21 of 25 new designs. It also
noticed something after the table was read. All four losses were at the tight
clock target, and three were the three cells whose cost ratio was lowest, just
above theta. If that held up, the fix would be free: the clock is known and the
ratio is measured on one point before the switch decides. Route randomly at the
tight clock when the ratio is low.

A pattern you spot after reading a table is a hypothesis, not a finding. So
this run wrote down six predictions and a test pool first, committed them,
and only then computed anything.

## The test

The test pool is every earlier cell where the ladder runs: 99 cells from
milestones 119 to 137. None of them suggested the reading, and none tuned the
ladder, which was fixed at milestone 115. Milestone 138's 25 cells, where the
reading came from, are reported separately and count in no test.

## What held and what didn't

**The clock half is refuted.** The ladder fails (loses to random by more than
a point) on 14 of 51 tight cells and 11 of 48 relaxed ones (Fisher p = 0.39).
Pairing the two clocks of the same design, the tight cell is the worse one on
19 designs and the better one on 23 (sign p = 0.64). With 13 of milestone 138's
25 cells at the tight clock, all four losses landing there had about a 6%
chance by luck alone. That looks like what happened.

**The threshold half holds.** Failing cells have lower cost ratios than the
others: the AUC is 0.67 (permutation p = 0.006), and 16 of the 25 failures have
a ratio of at most 4.

**But the guard it suggests saves nothing.** The band just above theta holds
the ladder's biggest wins as well as its losses. Over the 45 cells with a ratio
between 3 and 4, the ladder and random routing tie on the mean (6.20% against
6.03% regret). Above 4 the ladder has 2.65% against 4.44%. Routing randomly at
the tight clock up to a ratio of 4 gives 4.01% against the ladder's 4.21%. It
is better on 12 designs and worse on 11, with a 95% interval of -1.25 to +0.78
points. Raising theta at both clocks to 5 or 6 makes things worse. On milestone
138's own cells the same guard looks good (2.16% against 2.45%). That is the
in-sample flattery the test was there to catch.

| ratio band | cells | failures | ladder regret | random regret |
|---|---|---|---|---|
| 3 to 4 | 45 | 16 | 6.20% | 6.03% |
| 4 to 6 | 52 | 9 | 2.65% | 4.44% |

## What it means for the paper

The ladder's advantage grows with how dear routing is. Within a factor of
about 4 of the mapped cost, it's a high-variance coin flip that neither helps
nor hurts on average, so the threshold stays at 3. The paper now says that in
place of the tight-clock story, which this test refutes. Three of six
predictions held. The full table is in
[`experiments/tight_theta/results.txt`](../../research/verified-dse/experiments/tight_theta/results.txt).
