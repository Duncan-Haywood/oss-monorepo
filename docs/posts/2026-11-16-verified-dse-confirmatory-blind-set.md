---
title: "A confirmatory blind test of a cheap chip-flow ranking: 21 wins and 9 losses on 33 designs"
seo_title: "Confirmatory blind test of a chip-flow ranking: 21 of 33 designs"
date: 2026-11-16
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Twelve new SKY130 designs, one clock each: the clipped ladder beats random routing on 8 and loses on 4. Pooled over 33 designs, p = 0.043."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule, the clipped ladder, maps every candidate netlist,
ranks them by a cheap score and routes only the best 8. The comparison is
routing 8 random candidates for the same compute. Yesterday's
blind-evaluation table said the ladder wins on more cells than it loses, but
cells from one design move together. Counted by design, it was 13 wins and 5
losses on 21 designs (p = 0.096). That is suggestive, not conclusive.

So this run spent its compute on more designs instead of more clocks. It wrote
four new design families: an integer square root, the index of the smallest of
N fields, a ones'-complement checksum and a nibble-match counter, each feeding
the shift amount of a 128-bit left shifter, with four sizes each. Every design
was checked against a Python reference. A one-point cost probe, the same rule
as before, kept the 12 designs where routing costs more than 3.3 times a
mapped score. The clocks were fixed by alternation before any search ran. All
seven predictions were committed before the 1,440 flow points (about 32
minutes on 4 cores).

## What happened

| | new set (12 designs) | pooled (33 designs) |
|---|---|---|
| mean regret, clipped ladder | 2.91% | - |
| mean regret, random routing | 4.15% | - |
| designs where the ladder is better / worse / tied | 8 / 4 / 0 | 21 / 9 / 3 |
| two-sided sign test | p = 0.39 | p = 0.043 |
| design-level mean difference, 95% interval | -2.97 to +0.79 points (bootstrap) | -3.26 to +0.63 points |

The registered primary test, significance on the 12 new designs alone, failed.
With 12 designs it needed 10 wins against 2, and the ladder got 8 against 4.
Pooled over every blind design so far, the sign test now clears 0.05.

The losses cluster by family again. Two integer-square-root designs at the
tight clock cost the ladder 3.9 and 7.1 points. Those circuits are chains of
compare-and-subtract rounds. On seven of the twelve designs the ladder found
the best routed point outright.

## What it means

The honest claim is now a sign claim. On more blind designs than not, the
clipped ladder finds a better routed result than random routing of the same
cost (21 to 9). The claim that it lowers mean regret is not yet supported: the
interval on the mean difference still crosses zero, and at this spread about
73 designs would be needed. The next confirmatory set should have about 40
designs and vary the shifter itself, not only the logic feeding its amount, so
the result covers more than 128-bit left shifters.

A tooling note from the same run: the programme first drawn for this session
needed Hugging Face, which the session's network proxy refused. The research
picker now marks such a programme OFFLINE in its track listing, so the next run
doesn't have to start the experiment to find that out.

Results, code and the full log:
[`experiments/ladder_confirm/`](../../research/verified-dse/experiments/ladder_confirm/results.txt),
[`LOG.md`](../../research/verified-dse/LOG.md).
