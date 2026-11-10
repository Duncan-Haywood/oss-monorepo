---
title: "Proving a staff roster can't cover more: column generation, and why identical shifts stalled it"
description: "The roster builder now prices each person's best week on demand. One synthetic week went from unproven after 100,000 search nodes to proven in 635."
date: 2026-11-10
tags: [shift-roster-builder, scheduling, optimization, operations-research]
---

The shift roster builder does more than build a week. It also checks how good
the week is. When it leaves shifts open, it tries to prove that no roster could
cover more under the same rules (availability, rest between shifts, weekly hour
caps, days in a row). A manager can then tell "nobody can take Friday's close"
apart from "the search gave up".

That proof is a branch-and-price on the Dantzig-Wolfe LP. Each column is one
person's whole week: a set of shifts they could legally hold. Until today the
engine listed every such set up front. That works when a person has a few
thousand possible weeks. It stops when they have tens of thousands. Above
60,000 the engine skipped the LP, and one of our bench weeks (10 people, 28
shifts) was left at "at least 41 hours must stay open" while the roster had 48
open.

**Pricing on demand.** Column generation lists nothing. It solves the LP over the
weeks found so far and reads a price for each shift off the solution. Then, for
each person, it asks: which legal week of shifts is worth the most at these
prices? A small depth-first search answers that. It is pruned by a
fractional-knapsack bound on the person's weekly hours, and by the rules
themselves: dropping a shift never breaks a rule, so a branch that breaks one
can be cut along with everything under it. Weeks that beat the LP are added to
it, and the loop repeats until none does. On that week the root LP reached
47.00 from 919 generated weeks. The enumerated version had needed 111,202.

**The stall.** Then it stopped. The search ran 100,001 nodes and 497 seconds
with every node's bound at exactly 47.00. HiGHS, an independent ILP solver,
proved the answer is 48 in a tenth of a second. The cause was symmetry. A shift
that needs two people is two identical copies. Branching on "P3 works copy A"
just lets the LP slide P3 onto copy B for free, so the bound never moves.

**Branching on the shift, not the copy.** The branch is now "P3 works one of
this shift's copies" or "P3 works none of them". When every person's share of
every shift is 0 or 1, the node is solved outright: hand each holder a
different copy and you have a roster at the LP's value. With that, the week is
proven at 48 in 635 nodes and 3.5 seconds, with no hint of the answer given.
The 12-person, 30-shift week that took the old method 467 nodes and 8.8 seconds
now takes 5 nodes and 0.07 seconds. The other 15 bench weeks still match the
ILP optimum.

Column generation is now the engine's default for this proof.
Through the full roster build, that week reports 48 open with a proven floor of
48, where before it reported a floor of 41.

What this does not show: all of these are seeded synthetic weeks with hard
rules only, run on one machine. The per-person search is exponential in the
worst case; it is capped and says so when it stops early, and then it keeps
the parent node's (valid) bound. Pay is not part of this proof yet. That is
next: the same column generation, pricing each week by its cost.

Code and every measurement are in `ventures/shift-roster-builder` (`bnp.mjs`,
`eval/cg-bench.mjs`, the README).
