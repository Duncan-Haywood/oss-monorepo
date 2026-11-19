---
title: "Same designs, two corners: the chip-search ladder's edge holds, and mapped delay decides where"
seo_title: "SKY130 ff vs tt: why a mapped-netlist shortlist wins or loses"
date: 2026-11-19
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 13 add chains routed at ff and tt, the ladder's edge over random routing is 1.51 and 1.50 points; mapped delay rank, not area, predicts it."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) you can skip
by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps every ABC
pass sequence, then places and routes only the best eight by
`mapped area x max(period, 1.25 x mapped delay)`. It is scored against random
routing of the same wall-clock cost.

Two runs earlier today left a loose end. On 15 fresh short add chains at the
fast corner (ff_n40C_1v95), the ladder beat random routing by only 1.05 points of
regret. On 13 of the same designs at the typical corner (tt_025C_1v80), it beat
random by 1.50. Did the fast corner thin the ladder's edge?

## The test

Those 13 designs are the first in the programme run at two corners with the same
120 pass sequences and the same relative clock. Only the corner changes, so a
paired comparison can ask directly what the corner does. No new flow run was
needed. Before the script first ran, this run committed seven predictions. The
primary was that the ladder's ranking key agrees less with routing at ff: a lower
Kendall tau-b of the key against the routed area-delay score.

## What came back

- **The edge does not thin on the same designs.** SWC beats random by 1.51 points
  at ff and 1.50 at tt. The 1.05 on 15 designs comes from csum4, which ran only at
  ff, where SWC lost to random by 6 points.
- **The key ranks routing a little worse at ff.** Its tau-b falls from 0.44 to
  0.36. The interval of the change, -0.18 to +0.01, just touches zero, so the
  registered primary failed narrowly.
- **What decides the edge is delay, not area.** Across the 26 design-corner units,
  the key's tau-b predicts how far SWC beats random (Spearman -0.62). Split the key
  into its parts and the area half carries none of that (+0.04): mapped area ranks
  routed area at tau-b 0.92 at both corners, on winners and losers alike. The delay
  half carries nearly all of it (-0.58).
- **Random routing gets twice as bad at ff** (3.19% to 6.96% regret), which keeps
  the mean edge even though the ladder's own regret rises (1.69% to 5.45%).
- **Per design, ff is a coin toss with high stakes.** Mapped delay's rank agreement
  with routed delay is near zero on these designs at ff (median 0.002). The ladder
  wins one design by 10.5 points and loses another by 11.8.

Five of seven predictions held. The one other than the primary that failed was
the premise: that the edge would shrink on the paired designs.

## Why it matters

Milestone 134 found at tt that the ladder fails where mapped delay stops ranking
routed delay. This run shows the same mechanism across corners. For an engineer
using a mapped-netlist shortlist before place-and-route, mapped area can be
trusted at any corner. The open question is whether mapped delay still orders the
candidates once wires are added, and at a fast corner it often does not. The paper
draft now has one table with the rule against random routing at every operating
point the programme has run (tt at 40% and 65% utilisation, ss, ff).

Limits: 13 designs of one type, one clock each, global-route estimates, and tau-b
over the whole pool, while the ladder only uses its top eight.

Code, predictions and per-design table:
[`experiments/corner_rank/`](../../research/verified-dse/experiments/corner_rank/results.txt).
