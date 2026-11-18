---
title: "Packing the chip tighter: the cheap routing shortlist keeps its edge at 65% utilisation"
seo_title: "A chip-flow shortlist at 65% placement utilisation: 16 of 20 wins"
date: 2026-11-17
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Twenty blind SKY130 designs rerun at 65% placement utilisation: routing gets dearer and the ranking moves, yet the ladder still beats random routing 16 to 4."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by using cheap estimates. Its working rule, the clipped ladder (SWC),
maps every ABC pass sequence, ranks the mapped netlists by a cheap score, and
routes only the best 8. The baseline is routing 8 sequences picked at random,
which costs the same.

[The last run](2026-11-17-verified-dse-finishing-the-blind-set.md) brought the
blind evidence to 73 designs: the ladder wins 55 and loses 15. Every one of
those designs was placed at 40% utilisation, the operating point where the
rule's two settings were chosen. A practitioner packing a block tighter would
want to know whether the result was a property of the rule or of that one
operating point.

## What this run did

It reran the 52 one-clock blind designs at 65% placement utilisation, with
the same clocks and pass sequences and nothing retuned. A seeded run order,
seven predictions and the rule for a time-limited stop were committed before
any point ran. The flow stopped at its two-hour limit with 20 designs
complete (2,468 routed points), so those 20 are the analysed set.

## What came out

All seven predictions held.

| operating point | SWC mean regret | random | SWC better / worse | sign p |
|---|---|---|---|---|
| 65% utilisation | 2.52% | 7.13% | 16 / 4 | 0.012 |
| 40%, same 20 designs | 2.57% | 6.70% | 17 / 3 | 0.003 |

The new operating point is a real change, not a copy of the old one. Routing
costs more relative to mapping (the median ratio goes from 5.3 to 7.6), the
routed ranking of the same netlists shifts (median Kendall tau-b 0.74
between the two tables), and the best sequence changes on 8 of the 20
designs. Even so, the ladder's edge over random routing moved by -0.47
points (95% interval -1.82 to +1.06), and its sign agrees on 17 of the 20
designs.

The losses are the three 256-bit restoring dividers. That family also lost
the most at 40%: a chain of compares and subtracts is still where the cheap
score misleads.

## What went wrong, and what it does not show

One 256-bit design lost 82 of its 120 points at 65% to a pin placement error:
the smaller die no longer had enough perimeter for its I/O pins. The points
that survived are the larger netlists, so that design's cell is a selected
pool. We found this after the run and report it separately. Without that
design the result is 15 to 4 (p = 0.019).

This is 20 of 52 planned designs, one more utilisation rather than a second
library corner, one tool version, and global-route estimates rather than
detailed routing.

Code, rows and the full table:
[`experiments/util65_blind/`](../../research/verified-dse/experiments/util65_blind/results.txt).
