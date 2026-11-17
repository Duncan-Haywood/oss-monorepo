---
title: "Chip design search: the free check we hoped would protect a fix did not"
seo_title: "Routed pilot guard for clipped chip search score fails blind test"
date: 2026-11-12
tags: [research, chip-design, verified-dse, open-source, eda, negative-result]
description: "A guard meant to switch off a clipped mapped score on barrel shifters failed on 5 blind chip designs: 3.76% regret against 2.69% for the unguarded score."
---

The [verified-dse](../../research/verified-dse/) programme searches ABC
logic-synthesis pass sequences for open-source chip flows (Yosys, ABC and
OpenROAD on SKY130). The last step fixed its search rule's one known failure.
At a relaxed clock the router repairs timing up to the period and stops, so a
cheap mapped score should ignore mapped speed beyond the clock. Clipping the
score that way cut blind regret from 2.73% to 0.83%
([previous post](2026-11-11-verified-dse-clip-at-the-clock.md)).

The clip had one loss, on a table we had already looked at. On a 128-bit
barrel shifter, routing lands at 0.40 of the clock period, and the clip took
that cell from 0.00% to 19.2% regret.

## A check that costs nothing

The rule already routes one design point to time the router. That point says
how close routing comes to the clock: about 1.0 of the period on multipliers,
where the clip works, and 0.4 to 0.6 on barrel shifters. So the guard was:
clip only when the timing point lands at 0.9 of the period or more. We fixed
0.9 from that gap rather than tuning it, then committed five new designs and
six predictions before running the flow. That was 1,200 Yosys and OpenROAD
runs, close to two hours on 4 cores.

## What happened

- **The signal behaved as predicted.** Every relaxed barrel shifter landed at
  0.41 to 0.59 of the period. The 30-bit multiplier and the 28-bit squarer
  landed at 1.00.
- **The premise did not.** On two of the three new barrel shifters the clip
  *helped*: the 192- and 256-bit shifters went from 8.2% and 8.7% regret to
  0.00%. Only the 96-bit one lost (3.2% to 9.4%). Switching the clip off for
  every barrel shifter cost more than it saved.
- **Blind mean regret:** 2.69% for the unguarded clip, 3.76% with the guard,
  5.58% for the original rule and 3.28% for random routing at the same
  wall-clock. No threshold from 0.6 to 0.97 rescues the guard.

Four of the six predictions failed. The two that held say the signal sorts
the families as expected, but it does not decide whether the clip helps.

## Why

On these wide shifters the mapped delay hardly predicts the routed delay
(rank correlation -0.43 to +0.25). Whether ranking by area alone does better
in the top 8 changes from one width to the next. A measure of clock slack
cannot see that. Detecting it needs a few routed points to check whether the
two delays agree.

## Where this leaves the rule

Over all 124 cells tested since milestone 110, the rule with the clipped score
has 1.02% mean regret. The original rule has 1.87% and random routing 2.36%.
So the clipped score stays in, unguarded, and wide shifters are listed as its
known failure. The 30-bit multiplier and 28-bit squarer gave a third blind
replication of the clip: 10.5% and 7.8% without it, 0.00% with it.

Code, tables and tests: [`experiments/pilot_clip/`](../../research/verified-dse/experiments/pilot_clip/).
