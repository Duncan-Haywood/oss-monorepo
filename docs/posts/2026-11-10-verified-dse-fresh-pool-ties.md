---
title: "A cheap chip-design check that fails on ties: 2,400 fresh SKY130 runs"
seo_title: "Chip design search on fresh SKY130 data: ties break halving"
date: 2026-11-10
tags: [research, chip-design, verified-dse, open-source, sky130]
description: "2,400 fresh Yosys and OpenROAD runs test a chip search schedule picked on old data. It held, and the reason is one design whose cheap scores tie."
---

Earlier today we wrote that [skipping the cheapest estimate](2026-11-10-verified-dse-skip-the-cheap-rung.md)
was the schedule our [verified-dse](../../research/verified-dse/) programme picks when it
chooses without peeking, and that its edge was "small and within noise". All of that came
from one cached table of about 50 ABC pass sequences per design. So we ran new data.

**What we ran.** 120 ABC pass sequences that the original table never used, on the same ten
small designs and two clock targets, through four rungs: generic-gate synthesis, SKY130
liberty mapping, placement, and global route with timing repair (Yosys 0.70, OpenROAD 26Q3).
That is 2,400 flow runs, about 14 minutes on 4 cores. 17 of the sequences are rejected by ABC
on every design (a resynthesis pass after `dch`), leaving 103 or 104 points per cell. The
predictions were written into the analysis script before the flow ran.

**What held.** All five predictions. Routed area-times-delay regret, averaged over 20
design-clock cells:

| schedule | mean regret |
|---|---|
| skip the generic-gate rung, score all at the mapped rung, keep 8, route 8 | 1.04% |
| hand-chosen three-rung schedule (keep 70%, then 16, then 8) | 5.49% |
| route 8 random points | 8.00% |

**Why, and the caveat.** Almost the whole gap is one design. The 16-bit ripple adder has only
four distinct generic-gate scores, and 87 of its 104 points share the lowest one. The best
routed design sits in the *second* group. Keeping the best 70% by the cheap score keeps 73
points, all from the wrong group, so the search cannot find the optimum: 34 to 40% regret,
worse than routing random points. Leave out that adder and one barrel-shifter cell, and the two
schedules are equal (1.30% against 1.29%); cell by cell it is 7 wins, 9 ties and 4 losses.

So the practical advice is narrower than "skip the cheap rung, it is better". It is: **a cheap
score with many ties can silently cut the optimum, and skipping it costs nothing on average.**
If you run successive halving over an open chip flow, check how many distinct values your
first rung produces before you trust a cut on it.

Limits: the same ten small designs (new sequences, not new designs), a tool-version change
from the first table, and the cost of scoring every point at the mapped rung is not yet
re-priced. Code, raw results and tests are in the project directory, MIT licensed.
