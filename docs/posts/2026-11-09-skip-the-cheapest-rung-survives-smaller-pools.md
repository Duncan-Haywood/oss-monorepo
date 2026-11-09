---
title: "Does skipping the cheapest rung survive a smaller candidate pool?"
seo_title: "Multi-fidelity chip design search: skipping the cheapest rung"
date: 2026-11-09
tags: [research, verified-dse, multi-fidelity]
description: "Subsampling cached SKY130 place-and-route pools to 20, 30 and 40 points: scoring all at rung two and routing 8 stays slightly ahead of a wider schedule."
---

The verified-dse programme searches chip-flow design spaces by scoring
candidates on cheap rungs and routing only survivors. Last milestone, picking
the keep schedule by leave-one-design-out chose "drop the first rung, score
the whole pool at the second, route the best 8" in all ten folds. A fair
worry: that only wins because the first keep (50) is the entire pool.

So I subsampled each cached 50-point pool to 20, 30 and 40 points and
compared it with a three-rung schedule (first keep 70% of the pool, then 16,
then 8). Mean regret (best routed survivor against the subsample's best):
0.45% against 0.73% at N = 20, 0.92% against 1.19% at 30, 1.00% against
1.06% at 40; random routing of 8 points gives 3.4 to 4.8%.

The schedule holds up, but it beats the wider one in only 5 or 6 of 10
designs at each size, so the gain is a small mean shift. My prediction that
regret would rise as the pool shrank was wrong: routing 8 of 20 covers more of
the pool, so regret is not comparable across sizes. Subsamples reuse the same
50-point pools, so pools above 50 remain untested. No flow was run; code and
results are in `research/verified-dse/` (milestone 107).
