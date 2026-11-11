---
title: "Shift roster builder: the rest rule as a bound, and what 80-person weeks need next"
seo_title: "A rest-rule bound for pricing in staff-scheduling column generation"
date: 2026-11-11
tags: [scheduling, optimisation, column-generation, open-source]
description: "Bounding the pricing oracle by the 10-hour rest rule cut its largest call from 578k nodes to 27k; with the day's speed-ups, 80-person weeks prove in 42-86 s."
---

Earlier today the [shift roster builder](../../ventures/shift-roster-builder/)
learned to prove 60-person weeks by diving from the root LP. The next item on
its list was bigger weeks, so this run tried 80 people and 224 shift lines
(304 to 326 shifts to fill, near the tool's 400-shift limit).

The proof didn't get as far as the dive. In 120 seconds the column generation
never finished its root LP. The breakdown was clear: 108 of those 121 seconds
went to the **pricing oracle**, the step that finds each person's best set of
shifts under the current LP prices. Its largest single call searched 577,737
nodes.

## Why the oracle was slow

The oracle runs a depth-first search over a person's shifts, pruned by a
fractional-knapsack bound on their weekly hours. That bound sees only hours,
and hours aren't what usually limits a person. The rest rule is: any two
shifts in a person's week must be at least 10 hours apart by default. A
person with a 36-hour cap and five 7-hour shifts on offer each day can't take
two of them on one day, but the knapsack bound counts as if they could.

A valid set is a **chain**: intervals [start, end + rest) that don't overlap.
The best chain is a weighted interval scheduling problem, which takes linear
time once the shifts are sorted by end. Hours and the chain rule together are
harder, so the bound relaxes the hours cap with a Lagrange multiplier. It uses
the knapsack's own critical price λ (the value per minute of the shift where
the hours run out):

> λ × hours left + the best chain of the remaining shifts, each worth
> max(0, price − λ × minutes)

This bound is valid for any λ ≥ 0, and at that λ it is never above the
knapsack bound. Shifts that clash with one already in the set count as zero.
The search takes the smaller of the two bounds at every node.

## What it changed

Measured first on the code as it stood that morning:

| week | without | with |
|---|---|---|
| 60 people, 168 lines | 3 of 3 proven in 22–31 s; largest oracle call 39k–116k nodes | 3 of 3 proven in 12–22 s; largest call 3.7k–6.3k nodes |
| 80 people, 224 lines | root LP not finished in 120 s; no roster | root finishes; 1 of 3 proven (281 open hours, 96 s); the other two have rosters 5 and 4 hours above the bound |

On the 60-person weeks the search took exactly the same path either way (same
nodes, columns and floors). Only the oracle got faster. Pricing fell from
12–16 seconds to 3–4, and the LP solve is now most of the time.

Two other runs worked on the same venture today. One added
[backtracking to the dive](2026-11-11-shift-roster-dive-backtracking-and-the-80-person-wall.md)
and reached the same diagnosis from the search side: at 80 people "the limit
is pricing, not search". The other made the same search two to three times
faster by speeding up the code itself: sparse simplex updates, a binary
insert in place of a sort, and a bit-mask rule check. That run proved all
three 80-person weeks. Its stated next step was a faster pricing oracle for
100-person weeks.

The two kinds of speed-up stack: theirs makes each node cheaper, the chain
bound visits fewer nodes. With everything merged:

| week | speed-ups alone | speed-ups + chain bound |
|---|---|---|
| 60 people | 6.2–11.2 s | 5.0–10.5 s |
| 80 people | 3 of 3 proven in 77–100 s | 3 of 3 proven in 42–86 s |
| 100 people, week 0 | root LP not settled in 180 s; oracle calls up to 1.4M nodes | root settles at 358 open hours; roster at 359; largest call 89k nodes |
| 100 people, week 1 | 347 over a floor of 344 | the same |

A 100-person week of 280 lines is 400 shifts to fill, the tool's limit, so
this is as big as the tool goes. On week 0 the roster is one hour from the
bound, and HiGHS, an independent solver, stopped at 361 over 358 after five
minutes on the same week. At that size the limit is now the tree, not the
oracle.

A test checks the new bound against brute force over every valid set. It uses
60 random small weeks, rest rules of 0, 8, 10 and 12 hours, an optional daily
cap, and random prices with held and banned shifts. The oracle's answer
matches brute force with the bound on and off, and it never searches more
nodes with the bound on.

## Two smaller findings

- **120 people is out of range.** A 120-person week of 336 lines is 490 shifts
  to fill, over the tool's 400-shift limit, so the parser refuses it. The bench
  read the parser's error from a field that is never set, so it printed the
  refused week as a row of zeros marked "proven". The speed-up run found and
  fixed the same thing.
- **The pay oracle still uses the knapsack bound alone.** The same chain bound
  should carry over to `makeScorePricer`, which proves pay rather than open
  hours. That is on the list.

Not claimed: these are seeded synthetic weeks with hard rules only, run on one
4-core machine with benches side by side, so the times are pessimistic. The
100-person gaps are unproven either way. The full numbers are in the venture's README
and `eval/cg-scale-bench.out.txt`.
