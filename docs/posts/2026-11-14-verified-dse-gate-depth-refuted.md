---
title: "Chip design search: the 32-gate rule for wide shifters failed its blind test"
seo_title: "A gate-depth rule for when cheap chip rankings work fails a blind test"
date: 2026-11-14
tags: [research, chip-design, verified-dse, open-source, eda, statistics, negative-result]
description: "1,920 Yosys and OpenROAD runs on eight new shifters: the cheap ranking wins at 28 to 35 gates and loses at 36, so gate depth is not what decides it."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences with Yosys, ABC and OpenROAD on SKY130. Its
practical rule ranks candidates by a cheap mapped-netlist score and routes only
the best few. Wide shifters are where that ranking breaks. For three steps we
have tried to predict when it breaks from the circuit's structure alone.

The [last step](2026-11-14-verified-dse-gate-cut-32.md) found a clean line on
its blind shifters. The ranking won whenever 33 or more AND/NOT gates fed the
shift amount, and a 32-gate threshold looked right. This step registered that
threshold and its predictions before running anything. It then ran eight
shifters from four families no earlier table had used: 1,920 place-and-route
runs.

**Four of eight predictions failed.**

| design | gates in front of the amount | cheap ranking, regret | random routing, regret |
|---|---|---|---|
| 3-bit by 7-bit product | 28 | 0.00% | 11.5% |
| sum of three 5-bit values | 31 | 0.00% | 9.4% |
| 64-bit compare picks the amount | 33 | 0.00% | 2.6% |
| sum of three 6-bit values | 35 | 0.00% | 2.4% |
| 4-bit by 7-bit product | 36 | 23.1% | 3.9% |

(Each regret is the mean over the tight and relaxed clocks. Regret is how far the
chosen design's routed area times delay sits above the best in the pool.)

The ranking wins below the line and loses above it. The product rows settle it:
the same circuit family wins at 28 gates and loses at 36. On these 16 cells, the
ranking with no guard has 3.56% regret. Random routing has 5.69%, and the
registered 32-gate guard has 6.79%, worse than both.

Three structural rules have now been tuned on past data and then failed or moved
on the next blind set: "is there a shift operator", "how many word-level
operations feed the amount" and "how many gates feed it". We read that as a
sign the structural approach is spent. The next step will measure instead. It
will route a few of the pilot's points and check whether the cheap score's
order holds on them, priced first by replay on the 90 cells already run.

One question did get a positive answer. Earlier 64-bit shifters were too cheap
to route for the rule to matter. With two or four lanes sharing one amount,
the routed-to-mapped cost ratio rises from 3.4 to 5.6. On those cells the cheap
ranking beats random routing: 1.20% against 3.84% regret.

Limits: 16 cells from 8 designs, one tool version, one corner, global-route
estimates. Code, designs, the registered predictions and the full table:
[`experiments/amount_lanes/`](../../research/verified-dse/experiments/amount_lanes/results.txt).
