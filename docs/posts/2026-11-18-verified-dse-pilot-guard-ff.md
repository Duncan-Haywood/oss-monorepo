---
title: "A pilot that sees the problem but cannot afford to act: a rank-check guard at SKY130's fast corner"
seo_title: "SKY130 ff corner: a routed-pilot guard for a routing shortlist"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 77 SKY130 ff designs a pilot rank check raises the routing shortlist's regret from 2.98% to 4.21%, because falling back to random routing costs too much."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists with a cheap score, and
routes only the best eight. The baseline routes the same number of sequences
picked at random, for the same cost.

At the fast-fast corner (ff, -40 C, 1.95 V) SWC still wins on most designs,
but it loses badly on some. Three runs looked for a family or delay pattern in
those losses, and [the last one](2026-11-18-verified-dse-structure-or-delay.md)
found none. What the losing designs do share is a cheap score that ranks
routed results worse: a median rank correlation (Kendall tau-b) of 0.28,
against 0.46 elsewhere.

## The guard

So this run tried a per-design check. It routes a few random sequences first,
asks how well the cheap score orders them, and if the order is poor, it
spends the rest of the budget on random routing instead of the shortlist. The
same idea was tried at the typical corner in milestone 111, where it did not
help. The fast corner's weaker cheap score gave it a second chance.

The settings grid was 3, 4 or 6 pilot points, and a tau-b cut of -1, 0, 0.2
or 0.4. The unguarded rule was in the grid too. The pool was every finished
design from the four fast-corner tables (milestones 144 to 147), 77 designs in
all. Settings were chosen on three milestones and scored on the fourth, in
turn. Seven predictions were committed before the script first ran. This is a
replay of tables that already existed. No new flow ran.

## What it found

| rule | mean regret |
|---|---|
| unguarded shortlist (SWC) | 2.98% |
| guard, settings chosen out of sample | 4.21% |
| best guard setting, chosen in sample | 3.21% |
| random routing | 8.95% |

- **The guard makes things worse.** Out of sample it adds 1.23 points of
  regret, with a design-bootstrap interval of +0.12 to +3.09. No setting beats
  the unguarded rule even in sample.
- **The pilot does see the problem.** With 6 pilot points and a cut of 0.2,
  it falls back on 30% of draws where SWC loses and on 18% where it wins.
- **Acting on it is too expensive.** On the 14 designs where SWC loses, random
  routing is 6.28% against SWC's 13.06%, so a correct alarm saves 6.77
  points. On the other 59, random is 9.88% against 0.49%, so a false alarm
  costs 9.39 points. With 14 losers to 59 winners, a guard breaks even only if
  its false-alarm rate is below 0.17 times its hit rate. This one needed under
  5% false alarms and had 18%.
- **Better information would not save it.** Even reading the rank correlation
  over all 120 routed points, which no pilot can do, only gets to 2.82%. That
  statistic separates SWC's losses from its wins at an AUC of 0.70. The
  prediction was at least 0.70, and it came in at 0.6998.

A detector that knew in advance which designs SWC loses on would reach 1.75%,
so there is a real 1.2 points to win. A rank check on a few random points is
not how to win it.

## Limits

These tables had been seen before, though the guard's own numbers on them had
not been computed. The four folds vary in size, from 6 designs to 31. There is
one corner, and routing is global-route estimated. Only one fall-back was
tested, plain random routing.

## What next

At the typical corner the guard search ended the same way (milestones 126 to
135). The asymmetry points at the fall-back, not the alarm. Random routing is
9.9% on designs where the shortlist is near perfect. A fall-back that keeps
part of the shortlist would cut the cost of a false alarm. The next replay
tests whether that moves the break-even point on these 77 designs.

Full tables, the grid, the per-design results and the predictions:
[`experiments/pilot_tau_ff/`](../../research/verified-dse/experiments/pilot_tau_ff/results.txt).
