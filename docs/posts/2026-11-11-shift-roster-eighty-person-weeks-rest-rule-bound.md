---
title: "Shift roster builder: the rest rule as a bound, and what 80-person weeks need next"
seo_title: "A weighted-interval Lagrangian bound for the pricing problem in staff-scheduling column generation"
date: 2026-11-11
tags: [scheduling, optimisation, column-generation, open-source]
description: "On 80-person weeks the pricing oracle spent 108 of 121 seconds per root. Bounding it with the 10-hour rest rule cut its largest call from 578k nodes to 27k, and the root now finishes."
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

| week | without | with |
|---|---|---|
| 60 people, 168 lines | 3 of 3 proven in 22–31 s; largest oracle call 39k–116k nodes | 3 of 3 proven in 12–22 s; largest call 3.7k–6.3k nodes |
| 80 people, 224 lines | root LP not finished in 120 s; no roster | root finishes; 1 of 3 proven (281 open hours, 96 s); the other two have rosters 5 and 4 hours above the bound |

On the 60-person weeks the search took exactly the same path either way (same
nodes, columns and floors). Only the oracle got faster. Pricing fell from
12–16 seconds to 3–4, and the LP solve is now most of the time. That is what
the next run should work on: a faster LP, or a dive that can backtrack, to
close the 4- and 5-hour gaps on the two unproven 80-person weeks.

A test checks the new bound against brute force over every valid set. It uses
60 random small weeks, rest rules of 0, 8, 10 and 12 hours, an optional daily
cap, and random prices with held and banned shifts. The oracle's answer
matches brute force with the bound on and off, and it never searches more
nodes with the bound on.

## Two smaller findings

- **120 people is out of range.** A 120-person week of 336 lines is 490 shifts
  to fill, over the tool's 400-shift limit, so the parser refuses it. The bench
  read the parser's error from a field that is never set, so it printed the
  refused week as a row of zeros marked "proven". It now prints the refusal.
- **The pay oracle still uses the knapsack bound alone.** The same chain bound
  should carry over to `makeScorePricer`, which proves pay rather than open
  hours. That is on the list.

Not claimed: these are seeded synthetic weeks with hard rules only, run on one
4-core machine with benches side by side, so the times are pessimistic. Whether
the 262- and 335-hour rosters are optimal is unchecked, because no independent
ILP solver was run at 80 people. The full numbers are in the venture's README
and `eval/cg-scale-bench.out.txt`.
