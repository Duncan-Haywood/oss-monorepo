---
title: "Testing a fix that follows from the diagnosis: a delay check on the chip-flow ladder's top picks fails"
seo_title: "A delay check on a chip-flow ladder's top picks: a negative result"
date: 2026-11-16
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Routing the ladder's top 3 and checking whether the smaller netlist is slower flags 47% of cells where the ladder is perfect, and 45% where it fails."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule, the clipped ladder, maps every candidate, ranks the
candidates by mapped area times a clipped delay, and routes the best 8.
[The previous milestone's diagnosis](2026-11-16-verified-dse-why-the-ladder-fails.md)
found that the rule fails where the smaller netlists place and route slower,
which no statistic from the mapped netlists shows. It proposed a guard: route the
ladder's top few points first, which costs nothing extra because the ladder
routes them anyway, and check whether the smallest of them is also slower.

This run tested that guard. If the smallest-area point among the top 3 routes
more than 2% slower than the fastest, the guard spends the remaining 5 routes on
points at least as large as the fast one (or, in a variant, on random mapped
points). Every branch routes 8 points, the same budget as the ladder. Before
replaying it on the 90 cells of seven earlier flow tables, we committed six
predictions.

**The check fires as often where the ladder is right as where it is wrong.** It
alarms on 45% of the 17 cells where the ladder loses to random routing and on
47% of the 40 cells where the ladder finds the optimum. Among the top few
points, a smaller netlist routing slower than a slightly larger one is normal.
It is not a sign of failure. What decides the ladder's regret is whether the
routed optimum is inside the top 8 at all. On failing cells that optimum sits
around the 26th percentile of the ranking, far below anything a check on the
top 3 can see.

**So it costs about what it saves.** Mean regret is 5.01% against 4.77% for no
guard and 3.91% for the 32-gate rule on these seen cells. On the 40 cells where
the ladder is perfect, the alarm usually changes nothing, because the next
ranks already sit in the larger-area band. On two of them it costs 19% to 20%.
On the failing cells it saves one point (15.64% against 16.63%), almost all of
it on one 128-bit shifter. Sending the alarmed routes to random points does no
better. Four of six predictions were refuted.

**The cells behind the idea made it look better than it is.** On the 42 blind
cells that the diagnosis came from, the alarm separated the groups a little (50%
on failing cells against 28% on winning ones). That separation did not carry
over to the 90 seen cells. A rule suggested by a set of cells needs testing on
different ones, which is why this one was replayed on the 90 seen cells.

This closes the search for a probe-based guard on this rule. Random probes,
top-against-uniform probes, and now probes within the top have each failed to
beat having no guard. The unguarded clipped ladder is the rule the paper will
report. Its failure mode, a routed optimum outside the mapped top 8 on designs
where smaller netlists route slower, becomes a stated limitation and an open
problem.

Limits: this is a replay of committed flow tables, not a new flow run. It tests
one alarm statistic with two fall-backs, 200 draws per cell, and splits the cells
into groups using the ladder's own outcome. Code, per-cell table and tests are in
[`experiments/delay_check/`](../../research/verified-dse/experiments/delay_check/results.txt).
