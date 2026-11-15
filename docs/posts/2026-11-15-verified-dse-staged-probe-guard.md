---
title: "Chip design search: checking the ranking earlier buys the fall-back back, and the probes still cost too much"
seo_title: "Staged spot-checks of a chip-flow ranking: what early detection costs"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 90 replayed Yosys and OpenROAD cells, a check on a 24-point subset cuts failing-cell regret from 16.6% to 9.2% but costs 4.2 points where ranking was right."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule maps every candidate, ranks them by a cheap clipped
score, and pays for place-and-route only on the best 8. On most designs that
beats routing random candidates for the same wall-clock. On some wide shifters
it loses badly.

The [last step](2026-11-15-verified-dse-top-probe-guard.md) found a check that
can tell those shifters apart: route the ranking's best 3 and 3 random
candidates, and distrust the ranking when its best loses. It flagged failing
cells in 54% of draws, but it came too late. By the time the whole pool was
mapped, the budget left for a fall-back was 2 routes.

## Checking earlier

This step moves the check forward. Map a random 24 of the roughly 103
candidates, run the same test inside those 24, and only then decide. If the
ranking passes, map the rest and route its best. If it fails, spend everything
left on random routing, starting with the subset's already-mapped candidates
because they are cheaper to finish. We wrote the rule and six predictions into
the repository before computing anything (commit 314c967d1), then replayed it
on the same 90 cells. No new flow run was needed.

## What came out

The budget fix works. On the 17 cells where the unguarded ladder loses to
random routing by more than a point, the staged guard has 9.16% mean regret,
against 16.63% unguarded and 13.32% for the last step's guard (random routing:
4.25%). It distrusts the ranking in 40% of draws there and in 9% of draws on
the 40 cells where the ranking is near perfect.

The guard still loses overall: 5.31% mean regret over the 90 cells, against
4.77% with no guard and 5.44% for random routing. Five of the six predictions
held; the one that said it would beat no guard did not. The cost is on the
cells where the ranking was right. When the guard trusts the ranking, 6 of the
8 routes have already gone to probes, so only 2 go to the ranking's global
best. On a leading-zero normaliser where the unguarded ladder finds the best
candidate every time, that leaves 18% to 19% regret with almost no false alarms.
Over the 40 winning cells the probes cost 4.23 points.

With one probe each way instead of three (read after the table, not chosen),
the guard gets to 4.50% to 4.55%, about level with no guard and still behind
the 32-gate structural rule's 3.91%.

## What it means

The last two steps settled where to look (the top of the ranking) and when to
look (before the pool is mapped). The remaining problem is what the look
costs. Every probe routed in a trusting draw is a ranked candidate not routed.
The next step uses probes the schedule pays for anyway: the timing pilot,
which the rule already routes, as the random probe, and the subset's best
candidate, which the ladder would usually route anyway.

Results: [`experiments/staged_probe/results.txt`](../../research/verified-dse/experiments/staged_probe/results.txt).
Log: [`LOG.md`](../../research/verified-dse/LOG.md).
