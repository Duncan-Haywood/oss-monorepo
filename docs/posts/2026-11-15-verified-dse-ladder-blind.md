---
title: "Chip design search tested blind: the plain ranking beats random, and every guard costs more than it saves"
seo_title: "Blind test of a chip-flow ranking rule: no guard beats none"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 7 new 128-bit shifters run through Yosys and OpenROAD, the unguarded ranking has 2.70% regret against 5.57% random; both guards lose to it."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule maps every candidate, ranks them by a cheap clipped
score (the "ladder"), and pays for place-and-route only on the best 8. When
routing is cheap relative to mapping, it routes random candidates instead.

For a dozen steps the programme has tried to bolt a safety check onto the
ladder, because on some wide shifters the ranking is badly wrong. Two checks
survived replay on old data: a rule that distrusts the ladder when fewer than
32 gates sit in front of the shift amount, and a pilot probe that routes one
random candidate against the subset's best. The [last blind
test](2026-11-15-verified-dse-blind-guards.md) was inconclusive because half
its designs never reached the ladder at all.

## A blind set built to be informative

This step fixed that first. We wrote four new families of 128-bit left
shifters whose amount comes from real logic: a CRC-7 of a 16-bit field, two or
three BCD digits converted to binary, a 16- or 48-bit compare choosing between
two amounts, and a multiplicative hash of a 12- or 14-bit key. Each was checked
against a Python model with Yosys before anything ran.

Then a cheap probe ran one default flow point per candidate and kept only the
ones whose routing cost was well above the switch threshold. The rule was in
the file before the probe ran. Seven of nine designs passed. The rules and nine
predictions were committed before the 1,680-point flow run (commit 789b0a8ca).

## What happened

All 14 cells reached the ladder branch. Mean regret against the best routed
point in each pool:

| rule | blind mean regret |
|---|---|
| unguarded ladder | 2.70% |
| 32-gate rule | 3.09% |
| pilot-probe guard, fresh fall-back | 3.23% |
| pilot-probe guard | 3.35% |
| equal-cost random routing | 5.57% |

The ladder found the best point exactly on 11 of 14 cells. It failed on two
designs: the CRC design at the relaxed clock (19.1% against 3.7% random) and
the three-digit BCD design at both clocks (9.3% against about 6.5%).

The 32-gate rule threw away four winning cells to save three losing ones. Two
of the designs it flags (20 and 28 gates) are cases where the ladder is
perfect. The pilot probe does notice trouble, distrusting 25% of draws on the
failing cells against 16% on the rest, but that is too weak a signal. It pays
1.35 points where the ladder was right and wins back only about 2 of the 7
points the ladder loses where it was wrong. Seven of the nine predictions held.
The two that failed are the 32-gate rule's premise and the hope that routing
only fresh points after an alarm would help on the failing cells.

## Pooled over every blind set

Across the three blind sets the programme has run (42 cells, 21 designs), the
unguarded ladder has 3.30% mean regret, the 32-gate rule 4.26% and random
4.65%. The ladder beats random on 28 cells and loses on 8 (sign test p =
0.001). The design-level bootstrap interval still crosses zero (-3.9 to +1.5
points), because a few failing designs drive the spread.

The practical reading is simple. For this flow, use the cost switch and the
plain clipped ranking, and don't add a guard tuned on seen designs. Every guard
tried has lost to no guard once it met designs it had not seen. Ladder failures
happen at 18, 24, 30, 36 and 51 gates, and successes at 20, 28 and 40 to 58, so
gate depth does not predict them.

One disclosure: the CRC design was first labelled `crc16`, which is also the
name of an older, non-shifter design. A test caught the clash after the run and
we relabelled it. Random seeds include the name, so the random column moved
from 5.64% to 5.57%. The same predictions held either way.

Limits: seven designs, one tool version, one corner, global-route estimates.
Full table:
[`experiments/ladder_blind/results.txt`](../../research/verified-dse/experiments/ladder_blind/results.txt);
log: [`LOG.md`](../../research/verified-dse/LOG.md).
