---
title: "Chip design search: two guards for a misleading ranking, tested blind, and neither beats random routing"
seo_title: "Two chip-flow ranking guards tested blind: neither beats random"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On six new 128-bit shifters run through Yosys and OpenROAD, a 32-gate rule has 2.25% regret and a pilot check 3.01%, against 2.20% for random routing."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule maps every candidate, ranks them with a cheap clipped
score, and pays for place-and-route only on the best 8. On some wide shifters
that ranking misleads, and the rule ends up far behind routing random
candidates.

Two guards are meant to catch those cases. A structural one, SWG(32), routes
at random whenever fewer than 32 gates sit in front of a 64-bit-or-wider shift
amount. A measured one, [SWP(32)](2026-11-15-verified-dse-pilot-probe-guard.md),
checks the ranking's best pick among 32 random candidates against the one
random candidate the rule already routes to time the flow, and it falls back
to random routing if the random one wins. On replayed cells the programme had
already seen, SWG(32) had 3.91% regret, SWP(32) had 4.39% and no guard had
4.77%. Three later variants of the check did no better, so this step stopped
tuning on seen data and tested both guards blind.

## The blind set

We wrote six new 128-bit shifters from three families no earlier table had
run: a Gray-code decoder in front of the shift amount, a value taken mod 97,
and one round of a 7-bit substitution table. Between 24 and 80 gates sit in
front of the amount. The designs, both rules and eight predictions were
committed (commit cf24c0607) before any place-and-route ran. Then we ran
1,440 points: 120 pass sequences, 6 designs and 2 clocks.

The run hit one snag in the setup. All three mod-97 designs came out cheap to
route (routing cost about 2.2 times a mapped score, under the cut of 3), so
every rule routes them at random and only 6 of the 12 cells tell the rules
apart. We probed gate depth before the run but not routing cost.

## What came out

- Blind mean regret: SWG(32) 2.25%, SWP(32) 3.01%, no guard 3.65%, random
  routing 2.20%. The order the replays predicted holds, but neither guard
  beats random.
- The ranking fails on the 24-gate Gray decoder (8.67% against 0.31% random),
  which the 32-gate rule flags. It also fails on the 51-gate substitution
  table at the tight clock (12.66% against 5.11%), which the rule does not
  flag. That is the rule's second miss above its own cut on blind data.
- The pilot check does see the failures: it distrusts the ranking in 31% of
  draws where the ranking loses and in 4% where it is perfect. But a
  distrusting draw recovers only part of the loss (7.20% against 10.00% with
  no guard and 1.91% for random routing).
- Over both blind sets the 32-gate rule has faced (28 cells), it has 4.85%,
  random routing 4.19% and no guard 3.60%.

Five of the eight predictions held. The three that failed were the two
"beats random" claims and the claim that the ranking wins on every design
with 43 or more gates.

## What it means

Gate depth has now missed above its own cut twice on blind data, at 36 gates in
[milestone 125](2026-11-14-verified-dse-gate-depth-refuted.md) and at
51 gates here. The pilot check is informative out of sample, but its fall-back
still spends part of its budget on the ranking it has just distrusted. The
next step fixes the setup first: check routing cost as well as gate depth
before fixing a blind set, so every cell counts. Then it tests a fall-back
that drops the ranking entirely, on enough designs to tell 2% from 3%.

Results: [`experiments/blind_probe/results.txt`](../../research/verified-dse/experiments/blind_probe/results.txt).
Log: [`LOG.md`](../../research/verified-dse/LOG.md).
