---
title: "Softening the fall-back does not save the guard: hedged fall-backs at SKY130's fast corner"
seo_title: "SKY130 ff corner: hedged fall-backs for a routing-shortlist guard"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Keeping part of the ladder when a pilot distrusts it lifts the break-even ratio from 0.17 to 0.24, well short of the 0.58 the pilots run at."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the results with a cheap score and routes only
the best eight. At the fast-fast corner it wins on most designs, but loses
badly on 14 of 73.

[The previous run](2026-11-18-verified-dse-pilot-guard-ff.md) tried a guard:
route a few random sequences first, check whether the cheap score ranks them
correctly, and if not, fall back to routing random sequences. The pilot did
notice the weak designs, but random routing was too poor a fall-back. A false
alarm cost 9.4 points of regret, a caught loss saved 6.8, so the guard needed
a false-alarm rate below 0.17 times its hit rate. The pilots were at about
0.58.

## The question

What if the fall-back keeps part of the ladder? On distrust, map a random
subset of 8, 16 or 32 sequences, route the cheap score's best 1 to 3 of
them, then spend what is left of the same budget on random routes. That
should cost less where the ladder works. The question is whether it moves
the break-even far enough. The rule, the 94-entry grid and seven predictions
were committed before the replay ran
([`experiments/hedge_ff/`](../../research/verified-dse/experiments/hedge_ff/results.txt)).

## What the replay found

On the same 77 designs (four flow runs, 200 draws each, no new flow run):

| fall-back (pilot of 4, always used) | regret where SWC loses | regret elsewhere | break-even ratio |
|---|---|---|---|
| random routing | 6.15% | 9.89% | 0.174 |
| hedge: map 16, keep best 2 | 6.39% | 9.41% | 0.177 |
| hedge: map 32, keep best 3 | 6.63% | 7.07% | 0.232 |
| (unguarded SWC, for reference) | 13.06% | 0.49% | |

The hedge works the way it should: the 32-point version costs 2.8 points less
on the designs where the ladder works, and gives up only half a point where
it fails. But it is far too weak. A 32-point subset of about 120 sequences
rarely contains the design's best, so the hedge sits near 7% where the full
ladder sits near 0.5%. The best ratio over every pilot size is 0.244.

So nothing changes downstream. No hedged guard beats the unguarded ladder even
in sample (best 4.04% against 2.98%). The leave-one-milestone-out selection
makes the same choices as before and lands on 4.21%. Two of the seven
predictions held: the hedge's small cost on the losing designs, and the code
check that the old guard's numbers reproduce exactly.

## What it means

The guard question at this corner is not about the response, it is about the
detector. A pilot of three to six routed points has a false-alarm-to-hit ratio
more than twice what even the best fall-back can afford. Together with the
earlier work at the typical corner, the routed-pilot guard closes at both
corners, and the paper's fast-corner section will report the unguarded ladder
with its 14 losses as a stated limit, unless a pre-routing signal can be found
that separates those losses at a ratio below 0.24.

Limits: a replay on tables earlier runs had seen, one corner, global-route
estimates, and subset hedges only. A hedge using the full ladder needs the full
mapping, which at the typical corner starved the fall-back.
