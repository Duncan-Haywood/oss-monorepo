---
title: "A cheap chip-flow ranking, tested blind on right and 256-bit shifters: 21 wins in 25, and the mean edge holds"
seo_title: "Blind test on right and 256-bit shifters: 21 wins in 25"
date: 2026-11-16
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 25 new SKY130 designs the clipped ladder beats equal-cost random routing 21 to 4; over 58 blind designs its mean edge is -2.47 points, interval below zero."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule, the clipped ladder, maps every candidate, ranks them
by mapped area times a clipped delay, and routes only the best 8. The
alternative it has to beat is routing the same number of random candidates.

[The last run](2026-11-16-verified-dse-confirmatory-blind-set.md) left the
evidence half-finished. Over 33 blind designs the ladder won 21 and lost 9
(sign test p = 0.043), but the average advantage, 1.32 points of regret, had a
95% interval that still crossed zero. Every one of those 33 designs was also a
wide *left* shifter, almost all 128-bit, so a reviewer could fairly ask whether
the result was about shifters in general or about one shape of shifter.

## What we ran

Five new families of logic that compute a shift amount: restoring division, a
chain of saturating clamps, the range (max minus min) of a window, a dot
product of 3-bit vectors, and a count of fields above a threshold. Each has
four sizes, and each size was built twice: as a 128-bit logical *right*
shifter and as a 256-bit *left* shifter. That gave 40 candidates, each checked
against a Python reference on 30 input vectors before anything ran.

Before the flow ran we committed eight predictions, each design's clock
target, and a shuffled run order. With the order came a rule: if the flow had
to stop early, the analysed set would be the designs complete at that point,
taken in that order. A rule like that is fixed before any result exists, so a
short run can't pick the designs that happened to look good.

The flow did stop early. The session's two-hour background limit ended it at
3,026 of 4,800 routed points. By the rule, 25 designs were analysed: 13 right
shifters and 12 256-bit left shifters.

## What came out

| | designs | random routing | clipped ladder | ladder better / worse |
|---|---|---|---|---|
| 128-bit right | 13 | 4.75% | 2.18% | 10 / 3 |
| 256-bit left | 12 | 8.27% | 2.74% | 11 / 1 |
| all new | 25 | 6.44% | 2.45% | 21 / 4 |

(Mean routed regret: how far the best routed point found is above the best of
the 120 sequences. Source: `experiments/ladder_confirm2/results.txt`.)

The registered primary test, a sign test over the 25 new designs, gives
p = 0.0009. All eight predictions held, including the one we gave only a 40%
prior: pooled over all 58 blind designs, the ladder wins 42, loses 13 and ties
3 (p = 0.0001). Its mean advantage is -2.47 points, with a 95% interval of
-3.87 to -1.06, the first time that interval has fallen below zero.

## What it doesn't say

- The four losses are all at the tight clock, and three of them are the cells
  whose routing-cost ratio sits closest to the threshold where the rule
  switches on. We noticed that after the table existed. It is a lead to test,
  not a finding.
- Random routing does worse on the 256-bit shifters (8.27%), and that is part
  of why the gap there is wide. A pooled mean mixes test sets of different
  difficulty.
- Only 25 of the 40 planned designs ran, and the clamp family has only two
  complete designs. The setup is one tool version, one corner and one
  utilisation, with global-route estimates rather than detailed routing.

For the paper this changes the headline claim. It was "the ladder wins more
blind designs than it loses". It is now "the ladder lowers routed regret
against equal-cost random routing on designs it has never seen, by about two
and a half points on average". The code, designs and raw flow table are MIT
licensed in [`research/verified-dse/`](../../research/verified-dse/), and
`reproduce.sh` regenerates the table from the cached flow results.
