---
title: "Finishing a cut-short chip-flow experiment: 13 of 15 more wins for the cheap ranking"
seo_title: "Finishing a cut-short blind test: 55 of 73 designs for the ladder"
date: 2026-11-17
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "The 15 SKY130 designs a time limit cut from a pre-registered blind test, run to completion: the clipped ladder wins 13, and 55 of 73 blind designs overall."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped with cheap estimates. Its working rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists by a cheap score, and routes
only the best 8. The baseline it has to beat is routing 8 sequences picked at
random, which costs the same.

[Yesterday's run](2026-11-16-verified-dse-right-and-wide-shifters.md) fixed a
blind test of 40 new designs and a seeded run order before running anything,
plus a rule for the case where it ran out of time: analyse the longest prefix
of the order whose designs are complete. It did run out of time, after 25
designs. The rule meant those 25 were an honest set, but 15 designs nobody
had looked at were left on the table, and 13 of them had probed as the
designs where routing is dearest, the case
[the run after it](2026-11-17-verified-dse-losses-near-theta.md) had almost
no data on.

## What this run did

It resumed the same script, unchanged, with seven predictions committed
first. The flow took about 95 minutes on 4 cores for 1,774 routed points. The
new rows sit in their own file, so the earlier result and its tests stay as
they were.

## What came out

All seven predictions held.

| set | designs | SWC mean regret | random | SWC better / worse | sign p |
|---|---|---|---|---|---|
| the 15 new designs | 15 | 2.23% | 6.25% | 13 / 2 | 0.0074 |
| the whole 40-design set | 40 | 2.37% | 6.37% | 34 / 6 | 0.000008 |
| every blind design so far | 73 | | | 55 / 15 | 0.000002 |

Over the 73 blind designs the mean difference is -2.79 points of routed
regret, with a 95% interval of -3.98 to -1.59. At 33 designs, two
milestones ago, that interval still crossed zero.

The routing-cost ratio matters as the last run said. Over the 40 cells,
where routing costs 3 to 4 times as much as mapping, the ladder and random
routing tie (3.31% against 3.63%). Above 4 the ladder wins 29 of 31 cells.

## What it does not show

These 15 designs were the ones the seeded order left last, not a fresh draw.
Everything is one tool version, one process corner and one utilisation, and
"routed" means global route plus timing repair, not detailed route. The two
losses (a 3-bit dot product at the tight clock) belong to the same kind of
chained arithmetic that cost the ladder before.

Code, rows and the full table:
[`experiments/ladder_rest/`](../../research/verified-dse/experiments/ladder_rest/results.txt).
