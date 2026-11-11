---
title: "Chip design search: the cheap score was ranking for speed the router would throw away"
seo_title: "Clock-clipped mapped score fixes chip search at relaxed clocks"
date: 2026-11-11
tags: [research, chip-design, verified-dse, open-source, eda]
description: "Routing stops at the clock, so mapped speed past it counts for nothing. Scoring that way cut search regret on 7 blind chip designs from 2.73% to 0.83%."
---

The [verified-dse](../../research/verified-dse/) programme searches ABC
logic-synthesis pass sequences for open-source chip flows (Yosys, ABC and
OpenROAD on SKY130). Its rule is simple. Time one point. If routing a point
costs more than 3 times scoring its mapped netlist, score every candidate on
the mapped netlist and route only the best 8. Otherwise, route randomly chosen
candidates for the same wall-clock.

The rule had one known failure: multipliers at a relaxed clock, with 6 to 13%
regret. The last step looked for a statistic that flags those cells. Its
pre-registered guard failed on fresh data
([previous post](2026-11-11-verified-dse-no-cheap-guard.md)).

## Why the failure happens

The same 8 candidates that fail at the relaxed clock succeed at the tight
one, so the ranking alone does not explain the failure. What changes between
the clocks is the routed result. At a relaxed clock OpenROAD repairs timing
up to the period and stops there. On every relaxed multiplier in the 52
held-out cells, the median routed delay is between 0.998 and 1.000 of the
clock period. So routed area x delay comes out as area x period, and it
ranks candidates by area alone. The mapped score is mapped area x mapped
delay, and it still rewards mapped speed the routed design never keeps.

## The fix

Score a mapped point the way the router will: mapped area x max(period, 1.25
x mapped delay). The 1.25 allows for wire delay the mapped netlist cannot
see. It was chosen from six values on the 52 held-out cells.

## The blind test

The test ran on seven designs no earlier table had touched: 14- and 26-bit
multipliers, 16- and 24-bit squarers, a 32-port crossbar and two GF(2)
matrices. We committed the design list, the analysis code and six
predictions before the flow ran (1,680 Yosys and OpenROAD runs, about an
hour on 4 cores).

- **Mean regret fell from 2.73% to 0.83%.** The clipped score was better in
  5 cells and worse in none. The design-bootstrap 95% interval of the
  difference is -3.63 to -0.41 points.
- **Every relaxed cell that runs the ladder reached 0.00%.** The 26-bit
  multiplier fell from 9.58% and the 24-bit squarer from 11.30%. Tight cells
  were unchanged.
- **All six predictions held.** That includes the mechanism: routed delay is
  0.993 to 1.000 of the period on every new relaxed multiplier and squarer.

## Where it can hurt

The clip assumes routing lands near the clock. A 128-bit barrel shifter
routes at 0.40 of its relaxed period. On a table we looked at while
exploring (so not a test), the clip took that cell from 0.00% to 19.2%
regret. With whole design families held out, the selection shows no gain,
because all of the gain comes from one family. The evidence for the clip is
the blind table and the mechanism. The next step is a check the flow already
provides: the first routed point's delay as a share of the period, which is
about 1 where the clip is right.

Code, tables and tests: [`experiments/clip_score/`](../../research/verified-dse/experiments/clip_score/).
