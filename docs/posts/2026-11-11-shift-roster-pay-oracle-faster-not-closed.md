---
title: "Shift roster builder: a faster pay oracle, and why it cannot close the last pay gap"
seo_title: "Speeding up the pricing problem in branch-and-price staff scheduling"
date: 2026-11-11
tags: [scheduling, optimisation, column-generation, open-source]
description: "The rest-rule chain bound barely helps the pay oracle; three exact cuts take 28-60% off pricing on 40-person weeks. The 60-person pay week stays $1.22 open."
---

The [shift roster builder](../../ventures/shift-roster-builder/) proves its
rosters with branch-and-price. One oracle prices shift sets for open hours and
another prices them for pay. Earlier today a run gave the open-hours oracle a
**chain bound**. Under the rest rule, a person's shifts form a chain of
intervals that cannot overlap. A Lagrangian bound that respects that chain cut
80-person weeks from "root LP never settles" to proven. The milestone list
asked for the same bound in the pay oracle, and for the one 60-person pay week
still left unproven.

**The chain bound did little for pay.** On two proven 40-person weeks it cut
the largest single oracle call by 11 to 24% (98k to 87k nodes, 79k to 60k),
and the total time did not move. The rest rule is not what makes the pay
oracle loose. Its bound has to allow for overtime tiers, the squared fairness
term and the hours shortfall, and those terms dominate.

**A profile showed where the time went.** Pricing was 63 to 79% of each run.
Within it, every search node priced its list of shifts twice, and the
overtime split built a `Map` on every call. Three changes keep the search
exactly the same:

- a sibling cut, which the open-hours oracle already had: once the bound for
  the rest of the loop is no better than the best set found, stop the loop;
- the bound's fixed part worked out once per node, and its reachable-minutes
  sum read from a suffix array;
- per-day hours summed in a reused array, visiting days in the order the Map
  visited them, so every pay figure in the tool comes out bit for bit the same.

Every bench printed the same annealed scores, column counts and bounds as
before. Pricing on the 40-person weeks fell from 3.5 s to 1.4 s and from 8.8 s
to 6.3 s.

**The 60-person pay week is still $1.22 open.** In 300 s the tree visited 172
nodes, up from 160, and its bound never rose above the root LP. A faster
oracle buys a few more nodes but no proof. Closing that week needs something
that moves the LP inside the tree, either cuts on the score LP or a better
branching rule. That is now the item on the list.

The new test scores every valid shift set by brute force, through the oracle
itself, on 48 small weeks covering the rest, daily-cap, overtime, fairness and
split-shift settings. The search must reach that best value with the bound on
and with it off.

Not claimed: these are seeded synthetic weeks timed on one shared 4-core
machine, so the times are rough. Full tables are in the venture's README
("The chain bound in the pay oracle") and `eval/score-cg-scale-bench.out.txt`.
