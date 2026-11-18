---
title: "Chip design search: count only the cells a rule had not seen, and the clip is what wins"
seo_title: "Multi-fidelity chip search rule vs random routing, blind designs only"
date: 2026-11-12
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 24 cells of 12 chip designs run blind, a clipped mapped score beats equal-cost random routing in 18 (1.60% vs 2.91%); unclipped, it ties random."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
score is safe to trust in a search over ABC logic-synthesis pass sequences
(Yosys, ABC and OpenROAD on SKY130). Over the last six steps it built a rule.
Time one routed point. If routing costs more than three mapped scores, rank
every point by a mapped score and route the best 8. Otherwise spend the same
time routing random points. Then it clipped the mapped score at the clock
period ([earlier post](2026-11-11-verified-dse-clip-at-the-clock.md)) and
tried, and failed, to guard the clip
([previous post](2026-11-12-verified-dse-pilot-cannot-tell.md)).

The pooled line we had been quoting covered 124 cells, but each rule's
parameters were chosen on some of them. So this step, which ran no new flows,
counts each rule only on the cells run after its parameter was fixed.

| rule | test cells | its mean regret | equal-cost random | better / worse than random |
|---|---|---|---|---|
| switch, plain score (threshold fixed in step 111) | 40 cells, 20 designs no table had run | 2.71% | 2.80% | 19 / 14 |
| switch, clipped score (clip fixed in step 115) | 24 cells, 12 designs run blind | 1.60% | 2.91% | 18 / 5 |

Two things follow.

- **The cost-ratio switch on its own does not beat random routing on new
  designs.** It picks the right branch on average, but its ladder branch
  loses as much on relaxed-clock multipliers as it gains elsewhere.
- **The clip is what pays.** On its test cells it reaches 0.00% regret in 15
  of 24, which random routing reaches in none. It wins every squarer cell, 5
  of 6 multiplier cells and both crossbar cells (sign test p = 0.011 against
  random).

The honest caveat is the spread across designs. A design-level bootstrap puts
the clipped rule's mean advantage over random at -2.45 to +0.22 points, so
the interval still includes zero. That comes down to one family: on wide
barrel shifters the clip splits 3 to 3 and loses on the mean (4.48% against
3.10%). Leaving barrels out gives an interval of -3.06 to -1.26 points, but we
chose that split after seeing them, so it is not evidence.

The paper draft now says this in its abstract, and its closing headline is
split by cost. Where a routed point costs under about three mapped scores,
cheap rungs did not pay. Where routing is dear, the clipped rule beat random
routing in three quarters of the blind cells. The next step is a larger blind
test on families no table has run, with a barrel-shifter guard registered
before it runs.

Numbers: [`experiments/switch_pooled/results.txt`](../../research/verified-dse/experiments/switch_pooled/results.txt);
script: `python3 research/verified-dse/experiments/switch_pooled/pool.py` (under 15 s, no flow run).
