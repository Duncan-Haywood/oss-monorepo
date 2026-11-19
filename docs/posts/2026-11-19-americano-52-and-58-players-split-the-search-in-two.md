---
title: "Americano for 52 and 58 players: split the search in two and a stuck problem falls in seconds"
seo_title: "Americano for 52 and 58 players: whist designs by two-stage search"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "Three searches over hours found no rotation for 52 or 58 players. Pick the partners first, then the tables, and 58 takes 2.8 seconds."
---

The free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
plays a *whist design* when there is a court for every four players: everyone partners everyone else
exactly once and faces each of them exactly twice. For 4k+2 players, where that is impossible, it plays
the provable next best: no repeat partner, and each player misses exactly one partner.

By this afternoon every size from 4 to 64 had a stored design except three: 52, 57 and 58 players. Earlier
runs had spent 25 to 130 CPU-minutes on each with backtracking, tabu search, a SAT solver and two other
group structures, and found nothing. So a 52-player night played the 53-player design with an empty seat,
which left a court idle every round. 51 and 58 players fell back to the round-by-round search: 39 and 79
repeat partnerships over the night.

## Two problems, not one

A design is built from one *base round*. Round g adds g to every seat, counting mod 57 for 57 players, or
mod 51 plus one fixed player for 52. The base round has to do two things at once:

1. Its **partner** pairs have to use each difference d (counted as d or −d) exactly once.
2. Its **opponent** pairs, four per table, have to use each difference exactly twice.

The earlier searches moved single players between tables, which changes both conditions at once. When
the search got within one difference of a design, every move broke something else.

The new search ([`eval/whist-starter.c`](../../ventures/league-schedule-generator/eval/whist-starter.c))
takes the conditions one at a time. First it picks partner pairs that satisfy condition 1. Design theorists
call that a *starter*, and random backtracking finds one in microseconds. With the partners fixed, the
only choice left is which two partner pairs share a table. That is a matching problem with exact counts,
and it is solved exactly: always branch on the opponent difference with the fewest tables left that
could supply it.

## Why one starter should be enough

A quick count says how hopeful that is. At 57 players a starter has 28 partner pairs, and there are
27 × 25 × … × 1 ≈ 2.1 × 10¹⁴ ways to seat them two to a table. If opponent differences fell at random,
the chance that 56 of them land exactly twice in each of 28 classes is about 2.4 × 10⁻¹⁵. The product is
about 0.5 designs per starter. So the program draws a starter, searches it up to a budget, and moves on.

## What it found

| players | found | before |
|---|---|---|
| 58 (near-whist) | 2.8 s, on the first starter | nothing in 25 min of tabu or 2.2 h of SAT |
| 52 | 18 CPU-min, on the 8th starter | nothing in 60 min of tabu |
| 57 | nothing yet: 153 starters, 3.7 CPU-hours | nothing in 155 CPU-min across two methods |

Each design is checked pair by pair by an independent checker before it is stored.

The search has a heavy tail. At 49 and 53 players, which already have designs, it found nothing in
100 seconds. A miss tells you little; a hit is checked and done. So 57 players stay on the round-by-round
search for now. The next attempt there will change the group the design is built on, not add hours.

## What changes for a club night

| players, one court per four | before | now |
|---|---|---|
| 52 | 53 rounds, 49 games each, one court idle every round | 51 rounds, 51 games each, every pair partners once and faces twice |
| 51 | 39 repeat partnerships, 90 pairs never partner | design 52 with one empty seat: no repeats |
| 58 | 79 repeat partnerships, 108 pairs never partner | no repeats; each player misses exactly one partner |

Nobody has played these at a real court yet. The guarantees are checked in the tests
([`whist.test.mjs`](../../ventures/league-schedule-generator/whist.test.mjs)), and the method and
numbers are in the venture's README under "Whist designs for 52 and near-whist for 58".
