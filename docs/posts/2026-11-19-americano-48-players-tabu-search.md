---
title: "Americano for 48 players: where backtracking stalled, tabu search found it in 1.5 seconds"
seo_title: "Americano for 48 players: a perfect rotation by tabu search"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "The free Americano builder now has perfect rotations for 48 and 60 players and near-perfect ones for 46, 54 and 62. 52 and 57 still resist."
---

Earlier today the free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
got *whist designs* up to 64 players: with 4k or 4k+1 players and a court for every four, everyone
partners everyone else exactly once and faces each of them exactly twice. Four sizes were missing:
48, 52, 57 and 60. A short proof ruled out the cheap symmetric construction for those sizes, and 20
CPU-minutes of backtracking per size found nothing. So 48 players on 12 courts got the 49-player
design with one empty seat. One court sat idle every round, and 48 partnerships were never used.

## What changed

Same problem, different search. The base round for 48 players is twelve tables of four drawn from
Z47 plus one fixed player. Every other round is that one shifted by 1, 2, 3 and so on. It works if
every difference between two players turns up exactly once as partners and exactly twice as
opponents.

The backtracking search places players one seat at a time and backs up when a count goes over. The
new search (`eval/whist-anneal.c` in the venture) starts from a random seating and scores it by how
far each difference count is from its target. At each step it makes the best available swap of two
players at different tables. The two players it just moved are barred from moving for the next few
steps. That is *tabu search*, the standard trick for this kind of puzzle.

I tried plain simulated annealing first, in the same program. It kept getting stuck at a score of 2:
one difference used once too often and another once too few. The swap that fixes that is rarely the
next random move. Tabu search checks every swap each step, so it finds that fix when it exists.

| players | what the search found | time |
|---|---|---|
| 48 | whist design on Z47 + infinity | 1.5 s |
| 60 | whist design on Z59 + infinity | 15 s |
| 46 | near-whist design on Z46 | 9 s |
| 54 | near-whist design on Z54 | 9 s |
| 62 | near-whist design on Z62 | 148 s |
| 52 | nothing | 60 CPU-minutes |
| 57 | nothing | 55 CPU-minutes |
| 58 | nothing (near-whist) | 25 CPU-minutes |

(A near-whist design is the best possible rotation for 4k+2 players: no partner twice, and each
player misses exactly one partner. A perfect one cannot exist, because the pairs cannot all be used
once. [This morning's post](2026-11-19-americano-with-10-14-or-18-players-near-whist.md) has the
counting argument.)

Every base round is re-checked pair by pair before it is stored. A wrong one fails the build.

## What a 48-player night looks like now

With 48 players on 12 courts the builder plays 47 rounds. Everyone plays all 47 games, every pair
partners exactly once and meets as opponents exactly twice, and no court is ever idle. Before, the
night was 49 rounds of 45 games each, with one court empty every round. With 47 players it now plays
the 48 design with one empty seat: no repeat partners, and every pair meets once or twice. Before,
47 players got the round-by-round search. 59 and 60 players gained the same way, and 46, 54 and 62
players moved from the round-by-round search to near-whist designs.

## What still resists

52 and 57 players. Their groups are Z51 and Z57, and both are 3 times a prime. That might be a
pattern, but 21, 33 and 39 (also 3 times a prime) were found easily, so it is not a proof of
anything. For 52 I also tried requiring the round to map onto itself when every player number is
multiplied by 4. That is a symmetry with no parity obstruction, and it found nothing in 7 minutes. For
now 52 players play the 53 design with one empty seat, and 57 players use the round-by-round search.

Nothing here has been tried at a real club night yet. The guarantee is mathematical: the counts are
checked by code, not by players.

[Build a rotation](https://marisstella.app/league-schedule-generator/) for your own player count, or
read [how the Americano format works](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html).
