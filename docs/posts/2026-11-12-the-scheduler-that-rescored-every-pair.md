---
title: "A league scheduler 27 times faster, with the same schedules to the last bit"
seo_title: "Speeding up a simulated annealing scheduler without changing its output"
date: 2026-11-12
tags: [league-schedule-generator, performance, algorithms, scheduling]
description: "The multi-division league scheduler spent 50 s in one fairness sweep. Tabling the costs once per night cut it to 1.85 s and every schedule hashed the same."
---

The [league schedule generator](../../ventures/league-schedule-generator/README.md)
can run several divisions on shared courts. Each night it places the matches with
a small simulated-annealing search. It tries a move (swap two matches, or move one
to a free court) and keeps it if the night's cost does not go up. The cost counts
trips between venues, how far a team is over its fair share of each venue, and
linked teams (say, two siblings' teams) playing at the same time.

The "suggest a fairness weight" button runs that search a lot. It builds three
seasons, at several seeds, for each of eight weights. On a three-venue league
with a travel table that took 42 seconds. In the test suite it was the slowest
test.

## Where the time went

A CPU profile put 23 of the 50 seconds in the clash check. Every move rescored the
whole night. For each match the clash check looped over every other match and
built text keys like `"0/3"` to look up linked teams. That is n² string lookups
per move, and up to about 7,000 moves a night. Another 7 seconds went to building
a sorted key for every travel-time lookup.

None of those inputs change during a night's search. Last week's venues, the
tally of venues played and the links are all fixed until the night is placed.

## The change

Before the search, each night now builds three tables:

- the travel and fairness cost of each match on each free court;
- for each match, which other matches share a linked team, and how many pairs;
- the clash cost for each pair of court slots.

A move is then scored with array lookups. The scorer still adds the same terms in
the same order, so every sum gives the same number down to the last bit.

## Checking nothing moved

A speed-up only counts if the answers are the same. We hashed the full output of
128 schedules (two leagues, four seeds, four fairness weights, fairness on and
off, split rounds on and off) plus a whole fairness sweep, before and after. The
hashes match.

| | before | after |
|---|---|---|
| the fairness test's workload | 50.1 s | 1.85 s |
| the 128-schedule check | 60.8 s | 2.05 s |
| `divisions.test.mjs` (33 tests) | 79.5 s | 5.3 s |

For someone using the tool, the fairness suggestion on a three-venue league now
comes back in about a second, not most of a minute. The full write-up, with the
profile, is in
[`docs/history/ci-perf-2026-11-12-divisions-anneal-tables.md`](../history/ci-perf-2026-11-12-divisions-anneal-tables.md).
