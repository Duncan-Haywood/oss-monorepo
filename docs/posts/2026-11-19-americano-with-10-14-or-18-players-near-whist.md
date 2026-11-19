---
title: "Americano with 10, 14 or 18 players: the best rotation when a perfect one can't exist"
seo_title: "Americano with 10, 14 or 18 players: a near-perfect rotation"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "With 4k+2 players no rotation can partner every pair once. The free Americano builder now plays the provable best: one missed partner each, no repeats."
---

Earlier today the free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
got whist designs. With 8, 9, 12, 13, 16 or 17 players (4k or 4k+1) and a court for every four,
everyone partners everyone else exactly once and faces each of them exactly twice. With 7, 11 or 15
players it plays the next design up with one empty seat.

That left out 6, 10, 14, 18, 22 and 26 players. Those are common sizes for a club night, and they
stayed on the round-by-round search. With 10 players on 2 courts that search repeated 2
partnerships over the night, and some pairs never met at all.

## Why there is no perfect rotation for 10 players

Ten players make 45 pairs. Every game uses two partnerships, one per side. To use every pair as
partners exactly once you would need 22.5 games. So at least one pair never partners, and an odd
leftover appears for every size of the form 4k+2.

It is worse than one pair. Each player has 9 others, and partners one of them per game. If everyone
plays the same number of games, everyone misses the same number of partners, so the missed pairs
cover every player evenly. The fewest you can miss is one partner each: 5 pairs for 10 players,
split as a perfect matching.

## The rotation it builds now

The builder now plays exactly that bound. We call it a near-whist design. Seat the players round a
circle of 4k+2 places, and the base round puts k tables on 4k of the seats, with the other two sitting
out. Each later round turns the circle by one place. Partner distances 1 to 2k each appear once in the
base round, so every pair at those distances partners exactly once. The pairs straight across the
circle (distance 2k+1) never partner. They face each other twice instead. Every other pair faces each
other once or twice.

For 10 players on 2 courts over 10 rounds:

| | round-by-round search | near-whist design |
|---|---|---|
| games each | 8 | 8 |
| repeat partnerships | 2 | 0 |
| pairs who never partner | 7 | 5 (the minimum) |
| times a pair meets as opponents | 0 to 3 | 1 to 2 |

The gap grows with the group: at 34 players on 8 courts the search repeated 11 partnerships and
some pairs never met. The design repeats none, and everyone meets everyone. Every size is in
the venture's
[`eval/whist-vs-greedy.txt`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/league-schedule-generator/eval/whist-vs-greedy.txt).

## How the base rounds were found

The earlier whist bases came from backtracking. For these, a short simulated-annealing search does
the job. It swaps two seats of the base round and keeps the swap if the distance counts get no worse
(or sometimes when they do, early on), then restarts. It found 6 to 34 players in under 12 seconds
each, 38 in under two minutes, 42 in 45 seconds and 50 in under nine minutes. 46 found nothing in
15 minutes and stays on the round-by-round search for now. The 4k+2 problem has one unit of slack, one
opponent distance is used once instead of twice, and that slack is what makes annealing work here.
The same method on the exact whist sizes (where every count must hit its target) found nothing in
25 seconds and was dropped.

A separate check develops each stored base into the whole night and checks every pair. It counts
partners, the missed partner per player, opponents and sit-outs, and a base is stored only if it
passes.

## Limits

No real club night has used one yet. A short night (6 or 8 rounds) still compares the design's
first rounds against the search and keeps the better, since on short nights the two measured about
even. The rotation does not score games or rate players.

[Build a rotation](https://marisstella.app/league-schedule-generator/) (the Americano card): free,
in your browser, no sign-up.
