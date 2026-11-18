---
title: "At the fast SKY130 corner the routed ranking scrambles further, and the routing shortlist still wins 20 of 27"
seo_title: "Chip-flow routing shortlist at the SKY130 ff corner: 20 of 27 wins"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "27 blind SKY130 designs rerun at ff_n40C_1v95: tt and ff routed rankings share almost nothing, yet the cheap shortlist beats random routing 20 to 7."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists with a cheap score, and
routes only the best 8. The baseline routes 8 sequences picked at random, for
the same cost.

[The last run](2026-11-17-verified-dse-slow-corner.md) swapped the typical
cell library (tt) for the slow-slow one (ss, 100 C, 1.60 V) and found the rule
still won 24 of 27 blind designs. This run tried the other side: the fast-fast
corner, ff at -40 C and 1.95 V.

## What this run did

It used the same 52 blind designs, clocks, 120 pass sequences and seeded order
as before, at 40% utilisation, and swapped only the liberty file. Each design's
clock target came from its own baseline at ff, a median of 0.77 times its tt
period. Seven predictions were committed before any point ran.

The flow was slower than expected, and I looked at the numbers once, at 14
designs: 8 wins and 6 losses, not significant. Before running anything else I
wrote down
[a stopping rule](../../research/verified-dse/experiments/corner_ff_blind/STOP_RULE.md):
one more launch of at most 75 minutes, then analyse only the first 27 designs,
the same set the slow corner had. 31 finished, so the cap applied.

## What came out

- **The rule still wins:** better than random routing on 20 designs, worse on
  7 (two-sided sign test p = 0.019). Mean regret is 4.03% against 10.06%. The
  95% interval of the mean difference runs from -10.1 to -1.1 points.
- **The fast corner moves the ranking more than the slow one.** The median
  Kendall tau-b of the routed score between tt and ff is 0.19, against 0.34
  between tt and ss. The best sequence at tt is not the best at ff on any of
  the 27 designs. I had predicted the opposite, and that prediction failed.
- **Random routing pays for that.** Its regret rose from 6.35% at tt to 10.06%
  at ff. The ladder re-ranks at whatever corner it runs at, so it loses less.
- **Across four operating points** (tt at 40% and 65% placement density, ss,
  ff) the rule is ahead at all four on 14 of the 27 designs and behind at all
  four on none.

## Where it loses

Six of the seven losses are adder trees: the three carry-save adders and the
three dot products. The seventh is rng8l, from the range family. The carry-save
adders also lost at the slow corner. Division, the weak family at tt, won all
five designs at ff. This is a post-hoc reading, and the pattern moves with
the corner, so it is a lead to test, not a result.

## A side finding

Four wide clamp designs had *slower* ff baselines than tt ones, up to 2 times.
The cells are not slower: on the same netlist, timing analysis gives 55 ns
with the ff library against 95 ns with tt. The difference comes from mapping.
ABC, given the ff library, returns a netlist with unbuffered nets that fan out
to 255 to 510 gates. Changing the corner in a flow that maps per corner also
changes the netlist.

## Limits

These are 27 of 52 planned designs, and the stopping rule was set after one
interim look (disclosed above). Only the liberty changes, so wire parasitics
are the tt ones. One tool version, and routed costs are global-route
estimates.

Code, data and the full table:
[`experiments/corner_ff_blind/`](../../research/verified-dse/experiments/corner_ff_blind/results.txt).
