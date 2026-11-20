---
title: "Where a cheap chip-flow shortlist loses: mapped delay that says nothing about routed delay"
seo_title: "Why a mapped-score shortlist loses to random routing on SKY130"
date: 2026-11-20
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Over 183 SKY130 design units, a mapped-score shortlist loses to random routing where mapped delay ranks routed delay at tau-b near 0. No guard fixes it."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder SWC, maps
every ABC pass sequence and routes only the best eight by
`mapped area x max(period, 1.25 x mapped delay)`. Over 223 design units at two
library corners it has 2.58% mean regret. Equal-cost random routing has more
than twice that. But on 38 of the 183 units where the ladder runs, it loses to
random routing, sometimes by 20 to 30 points.

[Yesterday's run](2026-11-19-verified-dse-corner-rank.md) looked at 13 designs
run at both corners. There, the ladder's edge tracked one number: how well
mapped delay ranks routed delay (a Kendall tau-b we call tauD). Mapped area did
not matter. Today's run asked whether that holds across every unit we have
rows for, and whether it beats the older explanation, that the ladder loses
where its clip rarely binds. We committed seven predictions before the script
ran.

## What came out

| Signal (low flags a loss) | Loser AUC | ff | tt |
|---|---|---|---|
| tauD, mapped vs routed delay (all points routed) | 0.69 | 0.63 | 0.75 |
| share of points where the clip binds | 0.59 | 0.67 | 0.51 |
| tauD from one 8-point routed pilot | 0.63 | | |
| spread of mapped delay | 0.63 | 0.53 | 0.76 |

Losers have a median tauD of 0.015, so mapped delay tells you nothing about
which sequence routes fastest. On the other units the median is 0.160. tauD
separates the two groups better than clip share does, but the difference
(+0.11, interval -0.03 to +0.24) includes zero, so our primary prediction
failed. The split by corner was the useful part. Clip share is a fast-corner
signal only. At the typical corner the clip binds on losers and winners alike,
and tauD is what tells them apart.

One prediction held in a way we did not mean. We expected mapped area to carry
no information. Instead its agreement with routed area is slightly *higher* on
losers (0.933 against 0.921).

## Why it does not become a fix

Knowing where the ladder loses is not the same as being able to stop it. Take
the oracle flag, low clip share and low tauD, with every point routed to
measure tauD. It catches 17 of the 38 losers and also 26 units where the ladder
wins. Switching the flagged units to area-only ranking gives 2.81% mean regret.
The unguarded ladder has 2.76%. With one realistic 8-point pilot in place of
the oracle, the flag gives 2.98%, and that is before charging for the pilot's
routes. This is the fourth detector in a row to fail
(milestones 148 to 150 were the others). So the paper will report the ladder's
losses as a characterised limit: they happen where mapped delay carries no rank
information about routed delay.

Code, the per-unit table and the pre-registration commit are in
[`experiments/delay_rank/`](../../research/verified-dse/experiments/delay_rank/results.txt).
The numbers are global-route estimates replayed from tables earlier milestones
had already seen.
