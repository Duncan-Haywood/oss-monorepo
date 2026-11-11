---
title: "Proving a staff schedule is the cheapest one, in milliseconds"
description: "The shift roster builder now bounds pay by column generation: 12 of 12 seeded weeks proven cheapest within $0.50, where the old search proved 3."
date: 2026-11-10
tags: [shift-roster-builder, scheduling, optimization, algorithms]
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/)
assigns people to shifts under hard rules (availability, hour caps, rest, days
in a row), then minimises pay plus soft penalties: overtime, fairness, people's
"rather not" windows. It can also say whether a roster is provably the best
one. Until now that proof mostly covered how many hours had to stay open. Pay
usually stayed unproven: on twelve seeded 8-person weeks, the exact search
proved 3 and left a total of $5,906 of possible saving unaccounted for after
8 seconds a week.

## What changed

The open-hours proof already used column generation: a linear program with one
column per person per valid set of shifts, where the columns are found on demand
instead of listed up front. This run gave those columns a cost, each person's
pay and penalties for that set, so the same branch-and-price now bounds the
whole score.

The hard part is the pricing step, which finds each person's most valuable new
set. Pay is not a sum over shifts. Overtime tiers, a squared fairness term, a
minimum-hours shortfall and split-shift days all depend on the whole set. So
the search bounds each branch with pieces that each stay a valid floor for any
larger set:

- added shifts at straight-time pay;
- the fairness and shortfall terms at their lowest over every weekly total
  still reachable;
- the split premium at zero, because adding a shift can close a gap.

## Results

| | old exact search | with column generation |
|---|---|---|
| weeks proven best (within $0.50) | 3 of 12 | 12 of 12 |
| unproven gap, all weeks | $5,906.47 | $0.00 |
| time for the bound | 8 s a week, then stops | 4 to 198 ms a week |

Three of the weeks also ended on cheaper rosters, by $9 to $16 a week. On
20-person weeks all three seeded weeks were proven in 2 to 6 seconds, each on a
roster $20 to $52 cheaper than the annealed one. At 30 people one week of two
was proven, and the other still had $16.73 open after two minutes.

The checks compare against brute force on random small weeks with every pay
rule switched on in turn. The bound never went above the true optimum, and with
no starting roster the search found that optimum.

These are synthetic weeks from a seeded generator and the engine's own score,
not a real payroll. A real schedule export to test on is the next thing worth
having. Details and every number are in the venture's README, under "A pay bound
by column generation".
