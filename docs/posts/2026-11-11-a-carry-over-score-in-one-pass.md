---
title: "A carry-over score in one pass: scoring a round-robin starter over p numbers"
seo_title: "Fast carry-over score for starter round robins"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, combinatorics]
description: "A starter timetable's carry-over reduces to one difference sequence. Scored that way, a local search cuts 24 to 40 team round robins up to 7% further."
---

Earlier today the [league schedule generator](https://marisstella.app/league-schedule-generator/)
got [climbed starter timetables](2026-11-11-22-team-round-robin-with-perfect-carry-over.md).
That work put 22 teams at the carry-over floor, where every count is 0 or 1. It
scored each move with the full count: every team, every round. A second search
ran in parallel with a cheaper score, and it beat the climb from 24 to 40 teams.
This post is about that score.

## The count collapses

A starter numbers the teams 0 to p − 1 (p = N − 1) plus one fixed team. It
pairs the rest so the pair differences cover every nonzero residue once, then
shifts every pair by one each round. Write f(u) for the partner of u, and f(0)
for the fixed team. Team t meets r + f(t − r) in round r. So when it goes from
round r to r + 1, it fills a shifted copy of the carry-over cell
(f(u), f(u − 1) + 1), with u = t − r.

Summed over a full cycle of rounds, the count for two ordinary teams a and b
then depends only on b − a:

> D(d) = the number of u (other than 0 and 1) with f(u − 1) + 1 − f(u) = d,
> plus one for d = 1 (the fixed team plays r and then r + 1).

Russell's carry-over value, the sum of squared counts, is p · Σ D(d)² + 2p.
With the fixed team as a bye, the d = 1 term becomes the jump over the bye
round, and the 2p goes. The floor is D(d) = 1 for every d. That makes the score
one pass over p numbers, not a count over N teams and N − 1 rounds. A step
other than 1 only relabels the teams, so step 1 covers every starter.

The script checks the formula against the full count on every result. A test
checks it on every starter the tool ships.

## What the cheap score buys

`eval/starter-climb.mjs` makes 2 to 10 million moves in 40 seconds at 22 to 40
teams. A move frees two to five pairs, tries every way to re-pair those
residues with the freed differences, and keeps the best when it is no worse.
The best candidates are then scored exactly, with the season not wrapping
round, at every starting round.

| Teams | Climbed this morning | One-pass search | Floor |
|---|---|---|---|
| 24 | 612 | **570** | 528 |
| 30 | 1,002 | **948** | 840 |
| 36 | 1,488 | **1,422** | 1,224 |
| 38 | 1,718 | **1,648** | 1,368 |
| 40 | 1,890 | **1,816** | 1,520 |

Both searches found the same floor at 22 teams (440) and 21 (399), and tied at
26, 28 and 34. The tool now keeps the lower entry for each size. Below 22
teams neither search moved anything, so 12 teams stays at 156 against a floor
of 120. That size probably needs a construction other than a starter.

## Through the whole schedule

The page doesn't hand out a starter as it stands. It searches from it, and
from the circle method, and keeps the better result. With the new entries, a
24-team home-and-away season with home/away breaks weighted at 10 scores 2,224
carry-over and 154 breaks, against 2,488 and 178. At 30 teams it is 3,624 and
288, against 3,838 and 300. Both had got slightly worse with this morning's
starters; now both are below where they started the day.

The numbers and commands are in the generator's README, "An O(p) starter
score".
