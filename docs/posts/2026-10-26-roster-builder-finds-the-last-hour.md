---
title: "The roster builder now finds the last uncovered hour"
date: 2026-10-26
description: "A solver check showed the shift roster builder leaving 1 to 2 hours open on half of 12 test weeks. A coverage-only search pass now closes all of them."
tags: [shift-roster-builder, scheduling, optimization]
---

[Shift Roster Builder](../../ventures/shift-roster-builder/) schedules a week of shifts against people's availability, weekly caps and rest gaps. Last week an independent check (HiGHS, an integer-programming solver) solved 12 seeded test weeks exactly and showed the builder's rosters were 1 to 2 hours short of full coverage on 6 of them.

The reason was how the search treats pay. Early passes use it to break ties, so a roster can sit where freeing the last open hour means first undoing a cheap assignment. The new pass ignores pay and counts only open hours: it shuffles covered shifts between people at no coverage cost, pulls open shifts in through chains of swaps, and then repairs payroll with moves that never lose coverage. It only runs when shifts are still open.

Result on the same 12 weeks (8, 10 and 12 people, 22 to 30 shifts): the roster now matches the solver's optimum on all 12, including the 8-person week that a 20-times-longer search had left at 36 hours against an optimum of 35. The cost is up to about 18 seconds on a week where shifts stay open. It finds the roster but does not prove it: the builder's own lower bound is still under the optimum on 7 of the 12, so "proven" is not claimed there.

Two example pages (teenage staff limits, whose availability to widen) print numbers from the engine, so their tables changed: with a 14- and a 15-year-old in a school week, 7 shifts stay open instead of 8. Synthetic weeks only; the check covers hard rules, not pay.
