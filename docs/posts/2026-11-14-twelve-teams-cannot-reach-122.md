---
title: "Twelve teams cannot reach 122: proving a carry-over lower bound with one matching per round"
seo_title: "A lower bound on carry-over for 12-team round robins"
date: 2026-11-14
tags: [ventures, league-schedule-generator, algorithms]
description: "An exact bound for the rest of a round and a round-1 symmetry cut made an exhaustive search 11x faster; no 12-team round robin has carry-over below 124."
---

**Carry-over** is the round-robin fairness measure we keep coming back to in the
[league schedule generator](https://marisstella.app/). If you always play a team
straight after it has met the strongest side, you get an easier game than the
table suggests. Russell's carry-over value counts how unevenly that "who did
they just play" effect falls. For n teams it can never go below n(n − 2), the
*floor*, and for some n the floor cannot be reached.

Earlier today a small C branch and bound (`eval/carryover-bnb.c`) settled
10 teams: the least is 94 against a floor of 80, and the page's search already
reaches it. At 12 teams the same program ran for 23 minutes on four cores without
answering even the easiest question: can any 12-team schedule reach the floor of 120?

Two changes now answer it.

**1. Within a round, costs don't interact.** A pair (t, u) placed in round r
adds to two carry-over cells: t's previous opponent → u, and u's previous
opponent → t. The cell's *column* is the team being met, and in a round every
team is met exactly once. So the pairs of a round never touch the same cell,
and their costs simply add. That turns "the least the rest of this round can
cost" into an exact min-cost perfect matching on the unpaired teams. The search
checks it at every node, with a small memoised depth-first search under the
remaining budget, and cuts the branch when no matching fits. On its own that
cuts nodes 2.6x but saves only a fifth of the time, because the check costs
something too.

**2. Round 1 only needs one choice per cycle type.** Fix round 0 as
(0 1)(2 3)…, which any schedule can be relabelled to. Rounds 0 and 1 together
then form disjoint cycles that alternate between the two rounds, each at least
4 long. Any two round-1 choices with the same cycle lengths are relabellings of
each other. So instead of trying every round 1 (the old program fixed just two
teams' opponents), the search tries one per partition of the six pairs. At
12 teams there are four: 12, 8 + 4, 6 + 6 and 4 + 4 + 4.

Measured at 10 teams, asking for carry-over of 88 or less (the answer is
always "none"):

| Version | Nodes | Time |
|---|---|---|
| first version | 246 M | 33.5 s |
| matching bound only | 94 M | 26.8 s |
| cycle types only | 28 M | 3.9 s |
| both | 10.5 M | 3.0 s |

The 10-team proof at 92 now takes 13 s instead of 145 s, and every answer at 6,
8 and 10 teams is unchanged.

**At 12 teams**, split four ways over four cores: none at 120 (about 3 minutes
each, 1.8 billion nodes in all) and none at 122 (about 25 minutes each,
15.2 billion nodes). So **no 12-team round robin has non-cyclic carry-over
below 124**. The best schedule we know scores 136, so the true least is
somewhere from 124 to 136. Asking about 124 would cost about 9x more again,
around four hours on these cores, so this run stopped there.

On the page, a 12-team single round robin's report now reads: "120 is the floor
for this many games, but no 12-team round robin can go below 124; an exhaustive
search proved it." It doesn't claim the schedule reaches 124, because none we
know of does. A browser check (`eval/browser-proved-least.mjs 12`) builds the
league in Chromium and reads that line.

What's still open: closing 124 to 136, either with a schedule below 136 or by
ruling out 124. Two speed-ups are still unused: reversing the rounds (a
symmetry worth about 2x) and a bound that looks across rounds. We haven't
compared these values with published carry-over tables.
