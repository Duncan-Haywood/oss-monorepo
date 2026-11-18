---
title: "A detector that has already paid: pre-routing signals for a chip-search shortlist at SKY130's fast corner"
seo_title: "SKY130 ff corner: pre-routing detectors for a routing shortlist"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "No mapped-pool signal flags where the clipped ladder loses at ff (3.61% against 2.98%); post hoc, ranking by area alone does better."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the results with a cheap score (area times
mapped delay, with the delay clipped at the clock period) and routes only the
best eight. At the fast-fast corner (ff_n40C_1v95) it beats random routing on
most of 77 designs but loses on 14.

The last two runs tried guards that route a few random sequences first and
fall back to random routing if the cheap score ranks them badly
([milestone 148](2026-11-18-verified-dse-pilot-guard-ff.md)), and then gentler
fall-backs ([milestone 149](2026-11-18-verified-dse-hedged-fallback-ff.md)).
Both lost. The pilots raised the alarm on losing designs about 1.7 times as
often as on winning ones, and that is not enough.

## A detector that reads the mapped pool

This run looked for a signal available before any routing: eight features of
the mapped pool, such as how flat the cheap score's top eight is, whether the
clipped and unclipped scores agree, and how often the clip binds. All features,
the selection rule and eight predictions were committed before the script ran.

One cost point changes the question. A feature computed over the whole mapped
pool has already paid for mapping every sequence. What is left of the budget
routes exactly eight mapped points, so this kind of detector cannot fall back
to random routing at equal cost, which would route more than eight. The only
thing it can do is pick a different eight: by unclipped score, by mapped area
alone, or at random.

## What came out

- **The primary failed.** Chosen leave-one-milestone-out over every feature,
  direction, cut and response, the detector has 3.61% mean regret against
  SWC's 2.98% (interval of the difference -0.89 to +2.81 points).
- **The in-sample search finds nothing beyond chance.** Its best improvements
  are inside a 1,000-shuffle permutation null (p = 0.25 with the unrealisable
  random fall-back, p = 0.88 with the realisable ones).
- **The features see one thing.** SWC loses where its clip does not bind: the
  median share of points the clip touches is 0.04 on the losers and 0.49 on
  the rest. On those designs the clipped score is just the unclipped one, which
  ranks by a mapped delay that routing at ff does not keep. Two of my
  predictions had the direction wrong: losers show *more* agreement between
  the clipped and unclipped scores, not less.
- One of eight predictions held: every realisable response, always on, does
  better than SWC on the 14 losers.

## Post hoc: area alone

The table of responses showed something I had not predicted. Ranking the
mapped pool by synthesised area alone, which is the clip taken to its limit,
cuts the losers' regret from 13.06% to 6.25% and costs only 1.23 points on
the other 59 designs. As a rule of its own it has 2.69% against SWC's 2.98%,
better on 12 designs and worse on 4. That is a hint, not a result. The
interval (-2.19 to +2.07 points) spans zero, the reading came after the data,
and one design (csum2) goes from 0% to 66.6%. At the typical corner, milestone
32 found area alone a bad ranking. If the ff result holds on fresh designs,
the clip's strength is a per-corner setting.

## Next

Choose the clip strength at ff leave-one-milestone-out, then run the chosen
value blind on fresh ff designs through the flow, and replay area alone on the
typical-corner tables. The code and full table are in
[`experiments/detector_ff/`](../../research/verified-dse/experiments/detector_ff/results.txt).
