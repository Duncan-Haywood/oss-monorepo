---
title: "A slow library corner scrambles the routed ranking, and the routing shortlist still wins 24 of 27"
seo_title: "Chip-flow routing shortlist at the SKY130 ss corner: 24 of 27 wins"
date: 2026-11-17
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "27 blind SKY130 designs rerun at the ss_100C_1v60 corner: the best ABC sequence moves on 24 of 27, yet the cheap shortlist beats random routing 24 to 3."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists with a cheap score, and
routes only the best 8. The baseline routes 8 sequences picked at random, for
the same cost.

[The last two runs](2026-11-17-verified-dse-dense-placement-46-designs.md)
moved placement density from 40% to 65% and found the rule's edge unchanged.
Both used the same typical-typical cell library (tt, 25 C, 1.8 V). This run
changed the library instead: the slow-slow corner, ss at 100 C and 1.60 V.

## What this run did

The same blind designs, clocks, 120 pass sequences and seeded order as the
density runs, at 40% utilisation, with only the liberty file swapped. Each
design's clock target was re-derived from its own baseline at the slow corner,
a median of 2.19 times its tt period. Seven predictions were committed before
any point ran. The flow stopped at its two-hour limit with 27 of 52 designs
complete (3,311 routed points).

## What came out

Six of the seven predictions held.

| 27 designs | SWC mean regret | random | SWC better / worse | sign p |
|---|---|---|---|---|
| tt, 40% | 2.76% | 6.35% | 22 / 5 | 0.0015 |
| tt, 65% | 2.34% | 6.83% | 22 / 5 | 0.0015 |
| ss, 40% | 1.96% | 6.11% | 24 / 3 | 0.00005 |

The slow corner shakes up the routed ranking much more than density did. The
median Kendall tau-b between a sequence's routed score at tt and at ss is
0.34, against 0.74 between the two densities. The best sequence is the same
at both corners on only 3 of the 27 designs. A pass sequence tuned at one
corner does not carry over to another. The ladder does not need it to,
because it re-ranks at whatever corner it runs.

The refuted prediction is the interesting one. Earlier runs had restoring
division as the ladder's weak family. At ss it wins all five division designs,
and none of the five designs it lost at tt loses at ss. The three ss losses
(two carry-save adders and a clamp chain) are all designs it won at tt. So
the weak family was a property of the tt corner, not of the rule.

## What it does not show

This is 27 of 52 planned designs, a prefix of a fixed order. It is a
liberty-only corner: wire parasitics and RC settings stay at their tt
values, because the open platform files ship only one set. There is no fast
corner yet, and results come from one tool version with global-route
estimates.

Code, rows and the full table:
[`experiments/corner_ss_blind/`](../../research/verified-dse/experiments/corner_ss_blind/results.txt).
