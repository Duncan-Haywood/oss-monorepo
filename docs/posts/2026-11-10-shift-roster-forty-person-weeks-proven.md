---
title: "Shift roster builder: forty-person weeks, proven, and a crash that went first"
seo_title: "Proving a 40-person staff schedule optimal with column generation"
date: 2026-11-10
tags: [scheduling, optimisation, column-generation, open-source]
description: "Taking the shift roster builder's column generation from 10-person bench weeks to 20-60 people found a simplex crash on a 20-person week, then a tight LP that only needed a better search."
---

The [shift roster builder](../../ventures/shift-roster-builder/) does more than
fill a week. It can say how many shift hours **must** stay open, whoever you
hire into which slot, and it proves that number with branch-and-price: an LP
over each person's possible shift sets, with new sets priced in as they are
needed (column generation). Until today it had only been measured on weeks of
8 to 12 people. Many shops are bigger than that, so this run built weeks of 20,
30, 40 and 60 people (`eval/cg-scale-bench.mjs`, three seeded weeks per size,
76 to 245 shift copies) and checked every answer against HiGHS, an
independent integer-programming solver.

**The first bigger week crashed.** A 20-person week with 82 shift copies made
the roster build throw `simplex pivot limit` when "prove" was on. The small LP
solver inside the proof was cycling at its optimum. Rounding left basic values
like 1e-11 where there should be zero, so each step looked like progress, and
the rule that stops cycling (Bland's rule, switched on after 50 steps that go
nowhere) kept switching off again. The run passed 400,000 pivots on a 102-row
LP. Setting values within 1e-9 of zero to exactly zero ended it in a few
hundred pivots. A 40-person week then showed a second version of the same
problem: while the start-up big-M columns are in the basis the prices sit near
a million, and reduced costs of rounding size kept entering. The entering test
is now relative to the size of the prices. Both LPs are kept as test fixtures,
and a solver failure now ends the proof with the bound it already has instead
of taking the roster down with it.

**The LP was already right.** On all 12 weeks HiGHS solved, the
column-generation floor equalled HiGHS's optimum: 151, 78 and 48 open hours at
20 people; 181, 142 and 189 at 30; 169, 146 and 281 at 40; 300, 308 and 183 at
60. Nothing was wrong with the bound. What failed at 30 people and up was
finding a roster that reaches it inside a minute. Two changes fixed that up to
40 people:

- **Dive on ties.** When the LP is tight, every open node in the tree has the
  same bound, and picking "lowest bound" widened the tree level by level. Among
  equal bounds (on the open-hours grid) the search now takes the deepest node,
  so it follows one branch down to a roster.
- **Warm-start the LP.** Each pricing round used to solve the LP again from
  the start-up columns. Within a node the column pool only grows at the end, so
  last round's basis is still a feasible start, and the solve now begins there.

| people | before (60 s budget) | after |
|---|---|---|
| 20 | 3 of 3 proven after the crash fix, 17-33 s | 3 of 3 proven, 0.9-2.6 s |
| 30 | 2 of 3 proven, 54-60 s | 3 of 3 proven, 8-19 s |
| 40 | 0 of 3 proven | 3 of 3 proven, 40-41 s |
| 60 | 0 of 3 proven | 0 of 3 proven (floor = optimum, no roster in 60 s) |

The pricing oracle was never the limit. Its largest single call took 116,407
search nodes, against a cap of 2,000,000, and no call on any week stopped
inexact. The old 8- to 12-person benches still give the same floors, and the
hardest of them (the rolling-gap week that once sat 497 s without a proof)
now proves 48 in 0.9 s.

What this does not show: these are seeded synthetic weeks with hard rules only
(availability, rest gaps, weekly caps), timed on one machine, and pay is not
part of the proof. Sixty-person weeks still end unproven in a minute, which is
where the next run should look (a faster LP, or a rounding heuristic at the
root). The commands to repeat every number are in the venture README.
