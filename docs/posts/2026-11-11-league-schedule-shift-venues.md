---
title: "Odd-sized leagues: from 10 back-to-back home or away games per team to under 2"
seo_title: "Round robin home/away breaks for odd leagues: a closed-form pattern"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, round-robin]
description: "A 23-team league now gets 44 back-to-back home or away games instead of 127 at the same carry-over, from a home/away pattern read straight off the timetable."
---

The [league schedule generator](../../ventures/league-schedule-generator/README.md)
builds round robins that score well on two counts. **Carry-over** is about who
you play right after whom. **Breaks** count two home games in a row, or two
away games in a row. The "balanced" pick minimises carry-over plus 10 per
break.

For most league sizes the timetable comes from a *starter*: a pairing of
the numbers 1 to N - 2. Each round shifts every pair up by one. A general
search then sets home and away. That search handled leagues with a bye
badly. With 23 teams it left 127 breaks, five or six per team, so nearly
every team had runs of home or away games across its season.

## Read home/away off the starter

There is a home/away pattern that comes free with a starter. Pick a host
for each pair and keep that host in every round as the pair shifts. Team t
then walks through the starter's positions one per round, so its whole
season is one fixed string read backwards. Each team hosts once per pair,
so every team is balanced. The breaks have an exact count. Let E be the
number of neighbouring positions in the string that are both home or both
away. Then:

- with every team playing, breaks = (p - 1)(E + 1);
- with one team sitting out each round, breaks = (p - 1) E

where p = N - 1. The classic circle method has E = 0, which gives its
familiar N - 2 breaks, and zero with a bye.

Choosing the hosts to make E as small as possible is a parity puzzle: a pair
whose two numbers differ by an even amount needs an odd number of changes
between them. With at most 19 pairs it can be solved exactly by walking
every choice in Gray-code order, at most 40 ms at 40 teams.

## What changed

With a break price set, the search now also tries each built-in starter as
it is, with this pattern, and keeps it only when it scores strictly lower.
We also re-ran the starter climb with breaks priced into every move, which
gave a third table of starters. At the "balanced" weight:

| Teams | Before (carry-over / breaks) | Now |
|---|---|---|
| 19 | 323 / 75 | 323 / 36 |
| 23 | 565 / 127 | 565 / 44 |
| 25 | 665 / 164 | 713 / 48 |
| 30 | 1,164 / 92 | 1,110 / 84 |
| 38 | 1,928 / 154 | 1,928 / 108 |
| 39 | 1,813 / 404 | 2,477 / 76 |

18 of the 28 sizes from 9 to 40 score lower. None score higher, and run time
is unchanged. From 17 teams up, every odd league now has under two breaks per
team, where it had between 4 and 10. At 19, 23 and 38 teams the carry-over
is identical and only the breaks fall. The full table is in the
[README](../../ventures/league-schedule-generator/README.md) ("Home and away
that moves with the starter") and `eval/shift-search.txt`.

## A negative result and a bug

We also tried the round-refill search, which takes rounds out and refills
them, starting from the climbed starters at 13 to 18 teams. It found nothing
in six minutes per size: 14 teams stayed at 212 and 18 teams at 318. Those
starters are local minima for that move.

Writing the new climb turned up a bug in the old one. When it put back a
rejected move it restored the wrong partners, because it saved them before
shuffling the list. The old climb almost never rejects a move, so its tables
stand. The bug is fixed in both scripts.

Next is the same idea for home-and-away seasons, where odd leagues still
carry hundreds of breaks.
