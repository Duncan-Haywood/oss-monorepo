---
title: "Fifteen fresh add chains, no repeat of the miss: area-only ranking at the fast corner, tested blind"
seo_title: "SKY130 fast corner: is area-only routing shortlist ranking safe?"
date: 2026-11-19
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 15 fresh short add chains at ff, area-only ranking has 6.15% regret against 7.18%, with no repeat of csum2's 66% miss; 1.25 still wins held out."
---

The [verified-dse](../../research/verified-dse/) programme measures how much of
an open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder SWC, maps
every ABC pass sequence and routes only the best eight by
`mapped area x max(period, alpha x mapped delay)`, with alpha = 1.25.

[This morning's run](2026-11-19-verified-dse-alpha-per-corner.md) found that at
the fast corner (ff_n40C_1v95), ranking by area alone (alpha = 0) beat 1.25 on
76 of 77 designs. On the 77th, csum2, a short add chain feeding a shifter, it
missed the best routed point by 66.6%. Four milestones of data could not say
whether that miss was a one-off or common among designs like csum2. So this run
went and got new data.

## The test

Before any point ran, the run committed 16 fresh 128-bit short add chains
(carry-save sums, small dot products, sums of absolute differences, weighted
sums and three-operand averages, none run at ff before), the band rule, the
clock rule and seven predictions. One candidate, avg4, turned out to be
degenerate (its sum is narrower than the shift amount, so it maps to no cells).
It was dropped before any sequence ran, and the log says so. The other 15 ran
through the full flow with 120 ABC sequences each: 1,800 place-and-route points
in 49 minutes on four cores.

## What came out

| | area only (alpha 0) | alpha 1 | alpha 1.25 (paper) | random routing |
|---|---|---|---|---|
| 15 fresh designs, mean regret | 6.15% | 5.57% | 7.18% | 8.23% |

- **No repeat of csum2.** No fresh design has area-only at 20% or worse while
  1.25 is at 5% or better. The worst area-only loss is 13.5 points (avg8). The
  pre-registered primary, that area-only would be worse on average, failed: it
  is 1.03 points better (interval -4.50 to +2.38).
- **Held-out choice still loses.** Pooled over all 92 fast-corner designs,
  area-only is the best alpha in sample (3.25% against 3.66%). But picking alpha
  leave-one-milestone-out still does worse than leaving it at 1.25 (4.04%). The
  milestone that area-only gets chosen for is often the one where it loses.
- **The ladder's edge is thin here.** On these short add chains SWC beats
  equal-cost random routing by only about a point (7.18% against 8.23%). Two
  designs (csum4, avg6) miss by 15 to 22% under every alpha.

## What it means

csum2's miss is rare: 1 design in 92 at the fast corner, and none among 15 new
designs written to look like it. Area-only's fast-corner advantage is therefore
not one lucky design. But it is not stable enough across milestones to beat a
fixed alpha when chosen honestly, so the paper keeps 1.25 and reports area-only
as the in-sample alternative. Alpha = 1, which had the lowest mean on the fresh
designs, is the next value to test blind.

Code, the per-design table and the predictions:
[`experiments/addshort_ff/`](../../research/verified-dse/experiments/addshort_ff/results.txt),
log entry in [`LOG.md`](../../research/verified-dse/LOG.md).
