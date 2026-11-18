---
title: "Proving a roster leaves the fewest open hours, on every test week"
description: "The shift roster builder now solves the Dantzig-Wolfe LP exactly and branches on it, proving the fewest open hours on all 16 seeded test weeks."
date: 2026-11-10
tags: [shift-roster-builder, scheduling, optimization, operations-research]
---

When the shift roster builder hands a manager a week with shifts still open,
it should be able to say whether a better roster exists. On most weeks it
could already say so. Its exact check prices every shift (a Lagrangian
relaxation), branches on the price, and gets a floor on how many hours must
stay open. When the roster's open hours match that floor, the roster is
proven to leave the fewest.

Two of the sixteen seeded test weeks stayed unproven. On a 12-person,
30-shift week the roster left 75 hours open and the floor said 72. On a
10-person, 28-shift week it was 78 against 77. An independent solver
(HiGHS, via `eval/ilp-check.py`) had already shown that 75 and 78 are the
true optima, so the rosters were right and the proof was what fell short.

An earlier run had measured why. The strongest LP for these rules is the
Dantzig-Wolfe LP: one column for each set of shifts a person could legally
work in a week (availability, the weekly hour cap, rest between shifts,
daily and consecutive-day limits). On the 12x30 week it comes to 72.33, so
no LP on its own can prove 75. The gap is integrality, and the textbook way
to close it is branch-and-price: solve that LP at every node and branch on
the pairs it leaves fractional.

That is what landed (`bnp.mjs`):

- A small revised simplex solves the LP exactly, with big-M artificials for
  rows that lose their starting column after a branch. Its root value on
  the 12x30 week is 72.33, the same as HiGHS.
- Each branch says "person p holds shift s" or "p does not", which filters
  the enumerated columns. The search is best-first, and a node is cut once
  its bound, rounded up to the hour grid, reaches the incumbent.
- The floor is valid even when the search stops early, because it is the
  lowest open bound.

Results (`node eval/bnp-bench.mjs`, with the HiGHS optimum as the
incumbent):

| week | old floor | LP at root | proven | nodes | time |
|---|---|---|---|---|---|
| 12x30 week 1 | 72 | 72.33 | 75 | 467 | 8.8 s |
| 10x28 week 4 | 77 | 78.00 | 78 | 1 | 0.1 s |
| other 14 weeks | at optimum | at optimum | yes | 1 | under 0.5 s |

Most weeks need only the root LP. The priced floor was already within a
fraction of an hour, and the exact LP plus rounding gets the rest. The
12x30 week is the one that needs real branching.

It now runs inside the exact check by default, after the priced floor and
only when shifts are still open. When an integral LP finds a better roster,
that roster replaces the old one. A test compares it with brute force on 40
small random weeks. Run through the full engine, the proven floor now equals
the roster's open hours on all 16 weeks.

It also changes the built-in sample café week. The annealed roster leaves
19 hours open. The old exact search found the 15-hour roster only with a
large node budget, and at a 50-node limit it stopped at 19. Now an integral
LP inside the branch-and-price tree finds the 15-hour roster within its own
limits, and the week is proven even at 50 nodes. The first wiring had a bug
worth recording. The coverage pass after it reset the incumbent roster but
kept its score, so the cost search pruned against a 15-hour score with no
roster behind it and reported the 19-hour roster as optimal. A test now
pins that case.

Limits: all of this is on synthetic weeks under hard rules, and pay is not
part of the proof. Weeks where one person has more than 60,000 valid shift
sets skip it, as the priced floor already does. One such week, in another
bench, is still unproven at a floor of 47 hours against 48 open, even with
every set enumerated (111,202 columns, 90 s). The next step is real column
generation: price a person's best set as a small longest-path problem
instead of listing every set.
