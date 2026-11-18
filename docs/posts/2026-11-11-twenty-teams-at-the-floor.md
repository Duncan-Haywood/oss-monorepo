---
title: "Twenty teams at the floor: starter timetables for fair round robins"
seo_title: "Balanced carry-over for a 20-team round robin: starter timetables"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms]
description: "A seeded search over starter timetables found a 20-team round robin with every carry-over count 0 or 1. The league schedule generator now starts from it."
---

Earlier today the [league schedule generator](https://marisstella.app/league-schedule-generator/)
got a finite-field start for leagues of 4, 8, 16 or 32 teams. At those sizes
every carry-over count is 0 or 1: no team keeps meeting the same opponent
straight after the same other side. Other sizes still started from the circle
method and annealed from there. At 20 teams, the size of most European top
flights, that search stopped at a carry-over value of 448. The floor is 360.

## Starters

A *starter* is a way to pair up the numbers 1 to p - 1 (p odd) so that the
differences between partners cover every nonzero remainder mod p exactly once.
Add one extra team that sits still, shift every pair by the same amount each
round, and you get a valid round robin on p + 1 teams. The circle method is the
simplest starter, pairing i with -i. For carry-over it is one of the worst.

There are many starters. The new script, `eval/starter-search.mjs`, samples
them at random with a fixed seed, tries every round order (a step coprime to p)
and every starting round, and keeps the one with the lowest carry-over. It ran
for 20 seconds per size, at every even size from 6 to 40 except 8, 16 and 32.

## What it found

At 20 teams, the 1,938 starters it sampled included one with every carry-over
count 0 or 1. Its value is 360 with all 20 teams playing, and 323 for a 19-team
league where one team sits out each round. Both are the least possible. The
tests check the counts directly. I have not compared this starter with
published constructions.

Annealing from a starter is not always better. At 11, 13 and 30 teams the search
from the circle method ends lower. So the tool now runs both starts and keeps
whichever scores better on its own measure (carry-over plus a weight times
home/away breaks). No size gets worse, and a search at these sizes takes about
twice as long: 4.5 seconds instead of 2.7 for a 20-team home-and-away season in
Node.

| Teams | Before | Now | Least possible |
|---|---|---|---|
| 18 | 412 | 318 | 288 |
| 20 | 448 | 360 | 360 |
| 22 | 654 | 516 | 440 |
| 24 | 796 | 654 | 528 |
| 26 | 954 | 762 | 624 |

(Single round robin, carry-over only, seed 1. The full table, including
home-and-away seasons and odd sizes, is in `eval/starter-start.txt`.)

## The mirror comes back

When the first half of a season already has every count at 0 or 1, playing it
again with the venues swapped puts every count at 2, except one per team at 1,
which is already the least a full season can have. The whole-season search
could only add breaks there: at 20 teams it gave 1,478 carry-over with 122
breaks, against the mirror's 1,460 with 116. So the season search now scores the
plain mirror too and keeps it when it is better. A 20-team home-and-away season
from the tool is now 1,460 with 116 breaks. The 14 professional 20-team seasons
in the guide's data ran from 2,278 to 2,564.

## Open

The sample is thin at larger sizes: in 20 seconds the search saw only 122 to 289
starters at 34 to 40 teams. A longer scratch run found 478 at 22 teams and 570
at 24, against the table's 516 and 654. A smarter search over starters is the
next step. Twelve teams is still 152 against a floor of 120.

The code is MIT licensed: `carryover.mjs` (`starterOpp`, `STARTERS`) in
`ventures/league-schedule-generator/`, with the measurements in its README.
