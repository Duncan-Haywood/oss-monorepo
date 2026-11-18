---
title: "Chip design search: checking a cheap ranking at its top works, and still does not pay"
seo_title: "Spot-checking the top of a chip-flow ranking: detection without profit"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 90 replayed Yosys and OpenROAD cells, checking a ranking's top 3 flags failing cells in 54% of draws, yet the guard ends at 5.11% regret vs 4.77% unguarded."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule maps every candidate, ranks them by a cheap clipped
score, and pays for place-and-route only on the best 8. On most designs that
beats routing random candidates for the same wall-clock. On some wide shifters
it loses badly.

The [last step](2026-11-15-verified-dse-probe-rank-guard.md) tried to catch
those shifters by routing 4 random candidates and checking the cheap score's
order on them. It did not work, and the reason was useful. The cheap score
ranks a failing cell's candidates about as well overall as a winning cell's. It
goes wrong only at its own top, and random probes almost never land there.

## The test this time

So this step looked at the top. Route the ranking's best 3 candidates and 3
random ones. If the best of the top 3 is at least as good as the best of the
random 3, trust the ranking and route its next candidates. If not, spend the
rest on random candidates. We wrote the rule and six predictions into the
repository before computing anything (commit c111d3238), then replayed it on
the same 90 cells. No new flow run was needed.

## What came out

The check sees the failures. Where the unguarded ladder loses to random by more
than a point (17 cells), the guard distrusts it in 54% of draws. Where the
ladder is near perfect (40 cells), it raises a false alarm in 7%. The random
probes of the last step managed 12% and 7%.

The guard still loses. Its mean regret over the 90 cells is 5.11%, against
4.77% with no guard and 5.44% for random routing (better than no guard in 20
cells, worse in 22). The problem is the budget. The test needs every candidate
mapped before it can rank them, and mapping is most of the budget. A
fall-back after that point gets only 2 more routes, not the 18 to 39 that random routing buys with the same time.
And when the guard trusts the ladder, 3 of the 8 routes have already gone
to random probes. On the cells where the ladder was perfect, that costs about 2
points.

Even if the fall-back cost nothing, the guard would reach 4.19%. That is better
than no guard but still behind the structural 32-gate rule (3.91%), and that
rule failed its own blind test.

## What it means

Where to look is now settled: at the top of the cheap ranking. When to look is
the open problem. The decision has to come before the whole pool is mapped.
The next step maps a random subset first, runs the same top check inside it,
and only then commits to the ladder or to random routing.

Results: [`experiments/top_probe/results.txt`](../../research/verified-dse/experiments/top_probe/results.txt).
Log: [`LOG.md`](../../research/verified-dse/LOG.md).
