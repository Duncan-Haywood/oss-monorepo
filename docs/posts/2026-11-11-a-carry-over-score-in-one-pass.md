---
title: "A carry-over score in one pass: perfect 22-team round robins from a local search"
seo_title: "Balanced carry-over round robin for 22 teams: starter search"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, combinatorics]
description: "Carry-over of a starter timetable reduces to one difference sequence, so a fast local search finds perfect 22-team round robins and cuts 24-40 teams by 6-15%."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
spreads **carry-over**: who your opponent played the week before you. Russell's
measure squares, for every ordered pair of teams (A, C), the number of teams
that play A and then C next, and adds the squares up. The floor is reached when
every count is 0 or 1.

Earlier today the tool gained *starter* timetables: number the teams 0 to p − 1
(p = N − 1) plus one fixed team, pick a set of pairs whose differences cover
every nonzero residue once, and shift the pairs by one each round. A seeded
sampler found a starter with every count 0 or 1 for 20 teams. Past 22 teams it
was thin: each starter cost a full O(N²) count at every step and start, so it
managed 122 to 289 starters in 20 seconds.

## The count collapses

Write f(u) for the partner of u in the starter, and f(0) for the fixed team.
Team t meets r + f(t − r) in round r. So the carry-over cell it fills going from
round r to r + 1 is a shifted copy of (f(u), f(u − 1) + 1), with u = t − r.
Summed over a full cycle of rounds, the count for two ordinary teams a and b
depends only on b − a:

D(d) = the number of u (other than 0 and 1) with f(u − 1) + 1 − f(u) = d, plus one
for d = 1 (the fixed team plays r and then r + 1).

The whole cyclic carry-over is p · Σ D(d)² + 2p. With the fixed team as a bye
(an odd league), the d = 1 term is replaced by the jump over the bye round, and
the 2p goes. The floor is D(d) = 1 for every d: one pass over p numbers instead
of a count over every team and round. A step other than 1 is the same timetable
under a relabelling of the teams, so step 1 covers them all.

The script checks the formula against the full count on every result, and a
test checks it on every built-in starter at its stored step.

## A search instead of a sample

With a score that cheap, `eval/starter-climb.mjs` runs a large-neighbourhood
search. A move frees two to five pairs, then tries every way to re-pair those
residues that uses each freed difference once, and keeps the best when it is no
worse. It restarts after a long stall. At the end the best few starters are
scored exactly, with the season not wrapping round, at every starting round, as
the tool does when it builds a schedule. 40 seconds per size, about 7 to 20
million moves.

| Teams | Before (sampled) | Now (searched) | Floor |
|---|---|---|---|
| 21 (with a bye) | 475 | **399 (floor)** | 399 |
| 22 | 516 | **440 (floor)** | 440 |
| 24 | 654 | 570 | 528 |
| 26 | 762 | 716 | 624 |
| 28 | 878 | 828 | 728 |
| 30 | 1,110 | 948 | 840 |
| 34 | 1,460 | 1,274 | 1,088 |
| 36 | 1,620 | 1,422 | 1,224 |
| 38 | 1,928 | 1,648 | 1,368 |
| 40 | 2,112 | 1,816 | 1,520 |

These are the starter timetables alone, one round robin, all teams playing
except where noted. At 22 teams, and 21 with a bye, every carry-over count is
0 or 1, cyclic as well. I have not checked that against published
constructions; the tests count it directly.

Below 22 teams nothing moved: 6, 10, 12, 14 and 18 teams kept the sampled
values after 40 seconds and millions of moves, so the floor there likely needs
something other than a starter.

## In the tool

The new table is what the schedule search starts from (it still also runs from
the circle method and keeps the better). Full table, odd sizes included:
`ventures/league-schedule-generator/eval/starter-climb.txt`. The README's
"Starters by local search" section has the end-to-end numbers with home/away
breaks counted.
