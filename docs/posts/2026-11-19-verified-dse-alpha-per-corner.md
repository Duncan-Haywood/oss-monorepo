---
title: "One clip for both corners: area-only ranking wins 76 fast-corner designs and loses the one that matters"
seo_title: "SKY130 corners: should a routing shortlist's score change per corner?"
date: 2026-11-19
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Choosing the clip alpha per process corner raises fast-corner regret from 2.98% to 3.62%; at tt, area-only ranking is 8 points worse."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence and routes only the best eight by a cheap score:
mapped area times the mapped delay, with the delay clipped at the clock period
(more exactly, `area x max(period, alpha x mapped delay)` with alpha = 1.25,
chosen in milestone 115 at the typical corner, tt).

[Yesterday's run](2026-11-18-verified-dse-detector-ff.md) found, after the fact,
that at the fast corner (ff_n40C_1v95) ranking by area alone, which is the
alpha = 0 end of the same family, did better than alpha = 1.25: 2.69% mean
regret against 2.98% over 77 designs. If that held, the paper's rule would
need a different alpha per corner. This run tested that before writing it
down.

## What was fixed in advance

The grid (alpha in 0, 0.5, 0.8, 1, 1.25), the folds and seven predictions were
committed before the script ran. At ff, alpha is chosen leave-one-milestone-out
over the four milestones that produced the 77 designs. At tt, the same grid is
replayed on 118 cells from six milestones, including the 52 where 1.25 was
originally chosen and the 66 blind cells since. The scoring code is the
programme's own, unchanged, and alpha = 1.25 reproduces both published
baselines to the hundredth.

## What came out

| | alpha = 0 (area only) | 0.5 | 0.8 | 1 | 1.25 |
|---|---|---|---|---|---|
| ff, 77 designs | 2.69% | 2.74% | 3.39% | 3.44% | 2.98% |
| tt, 118 cells | 9.90% | 5.71% | 3.02% | 1.99% | 1.84% |

- **The primary failed.** Chosen leave-one-milestone-out, the ff rule picks
  area-only for three folds and ends at 3.62% against 2.98% (interval of the
  difference -0.83 to +2.76 points).
- **At tt, low alpha fails broadly.** Every fold keeps 1.25. Area-only is worse
  on 34 cells and better on 6, with one 64-bit adder at 343% regret.
- **Per corner beats one shared choice, but both lose to 1.25 everywhere**
  (2.54% and 2.65% against 2.29% over all 195 cells and designs).

## The one design

Looking at the per-design table afterwards: the ff case for area-only is one
design. On csum2, a short add chain feeding a shifter, SWC(1.25) finds the best
routed point (0.00% regret) and area-only misses by 66.6%. Drop csum2 and
area-only would have 1.85% against 3.02% on the other 76. That is a
post hoc number, and it is exactly the shape of evidence a careful rule should
not act on: a broad small gain against a rare large loss, with four folds that
cannot say how rare. At tt the same trade is not rare at all.

So the paper keeps one alpha, 1.25, at both corners. The next step is a blind
fast-corner flow run on fresh short-chain designs like csum2, to measure how
often that miss recurs.

Code and full tables: [`experiments/alpha_corner/`](../../research/verified-dse/experiments/alpha_corner/results.txt),
log entry in [`LOG.md`](../../research/verified-dse/LOG.md).
