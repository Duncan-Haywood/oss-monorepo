---
title: "Why a cheap chip-flow ranking fails: the area half is right, routing makes the small netlists slow"
seo_title: "Why a cheap chip-flow ranking fails: routed area-delay trade-off"
date: 2026-11-16
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 36 blind SKY130 cells, mapped area ranks routed area at tau 0.95, but where the ladder fails its picks route 3% to 27% slower than the optimum."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule, the clipped ladder, maps every candidate, ranks them
by mapped area times a clipped delay, and routes only the best 8. Across three
blind test sets (42 cells, 21 designs) it beats routing random candidates at
equal cost, 3.30% mean regret against 4.65%. Every guard meant to catch its
failures lost to having no guard: the shift-operator check, word-level depth,
gate depth and a pilot probe. It still fails on 8 of its 36 ladder-branch
cells, and
[the last blind run](2026-11-15-verified-dse-blind-guards.md) ended with a
question: what goes wrong on those 8?

This run answered it from the flow tables already committed, with no new
place-and-route. The routed score is area times achieved delay, so the log of
any pick's regret splits exactly into an area part and a delay part, each
measured against the routed optimum. We fixed six predictions before computing
the table. Five held.

**The area half is right.** Mapped area ranks routed area almost exactly where
the ladder fails and where it wins (Kendall tau-b 0.95 and 0.93).

**The delay half is where it loses.** On the failing cells, the best of the 8
points the ladder routes is smaller than the routed optimum on 7 of 8 cells and
slower on all 8, by 3% to 27%. Delay accounts for 149% of the log regret, which
means the area part works in the ladder's favour. Mapped delay, measured before
any wires exist, has no rank information about routed delay on these cells (tau
0.00, against 0.13 where the ladder wins). The smaller mapped netlists route
slower (tau of mapped area against routed delay -0.15, against +0.10 on the
winning cells). That statistic separates the two groups almost perfectly (AUC
0.06), but it needs the routed table.

**The clip is not to blame.** I predicted that the ladder fails where the clip
hides mapped delay most often. The prediction was wrong: the clip binds on
fewer points on the failing cells (0.42 against 0.55), and ranking without the
clip does worse there (16.9% regret against 14.3%).

**A run cannot see it before routing.** Mapped area and mapped delay rise
together on every cell, failing or not (a post-hoc check). The area-delay
trade-off that sinks the ladder exists only after placement and routing. That
explains why each guard based on RTL structure moved on the next blind set. The
failure belongs to the routed frontier of a design's pass-sequence pool, not to
how its shifter is written.

The next step follows from that. A useful guard has to route a couple of the
ladder's own top-ranked points first and check whether the smaller one is
slower. Those points are ones the ladder routes anyway, which
[an earlier milestone](2026-11-15-verified-dse-pilot-probe-guard.md) found is
the condition for a check to cost nothing when the ranking is right.

Limits: the 8 failing cells come from 5 designs, the statistics describe blind
data that was already used to score the rules, and everything is one tool
version, one corner and global-route estimates. Code, per-cell table and tests:
[`experiments/ladder_diagnosis/`](../../research/verified-dse/experiments/ladder_diagnosis/results.txt).
