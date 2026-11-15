---
title: "One night, turned six times: wait-free 19-, 25- and 31-team leagues on fully booked courts"
seo_title: "Wait-free odd round robins on fully booked courts"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "Three solver approaches failed on 19 teams, 3 courts and 9 time slots. A symmetry of order six made it a 23-second, one-night question."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can play three rounds on one night. On such a night no team should sit around
between its games: each team's games should be back to back. For an odd
league that is hard. Each round one team has a bye, so on a three-round
night three teams play two games and everyone else plays three.

Some settings leave no room at all. With 19 teams on 3 courts and 9 time
slots, a night has 27 matches and 27 slots. Every slot is used, and every
team's two or three games still have to be consecutive. 25 teams on 4 courts
x 9 is the same: 36 matches in 36 slots. Until today the page couldn't find
a wait-free season for either one. Over three seeds the 19-team leagues
waited 171 empty slots in total and the 25-team leagues waited 281.

## What had failed

- **The whole season as one SAT model** (the round robin and every night's
  layout together) ran past 30 minutes at 19 teams.
- **Cyclic round robins.** Here round *r* is the base round with every team
  number shifted by *r*, so one night's layout serves every night. That
  works when a night has spare slots. On these fully booked nights none of
  the 51 three-round patterns laid out, for any of 42 base rounds tried.
- **Packing copies of one night.** One wait-free night on its own takes
  about 25 seconds to find. Rename its teams six times so that no two teams
  meet twice, and what is left of the round robin is exactly one round.
  Searching for those renamings as a SAT problem ran for 25 minutes with no
  answer.

## What worked: let a symmetry choose the renamings

Pick the renaming in advance. Number 18 of the 19 teams in three rings of six
and turn each ring one step: 0→1→…→5→0, 6→7→…→11→6, 12→…→17→12. Team 18 and
the bye stay put. Turning six times brings everyone back, so if night 1 is
H, nights 2 to 6 are H turned once, twice, and so on up to five times.

When does that give a round robin? Follow any pair of teams around the
turning:

- A pair of opposite teams in the same ring, such as 0 and 3, comes back to
  itself after three turns. So do 1 and 4, and 2 and 5, so the three
  opposite pairs of a ring form one short cycle. With team 18 against the
  bye they make 10 pairs that cover every team exactly once. That is a
  whole round, so it becomes the last night: one game each, no waiting
  possible.
- Every other pair cycles through six distinct pairs. There are 30 such
  cycles, and a night of three rounds holds 30 pairs, bye pairs included.

So the only question left is about a single night. Find one wait-free
night that takes **exactly one pair from each of the 30 cycles**. Turning it
then uses every pair exactly once. That is a one-night SAT model of about
20,000 variables, and it answered in **23 seconds**. 25 teams work the same
way with three rings of eight: 39 cycles, a 39-pair night, solved in
**141 seconds**. 31 teams on 5 courts x 9, which had no design at all,
took three rings of ten and **626 seconds**.

Through the page's own builder, over seeds 1 to 3:

| League | Waits before | Waits now | Build |
|---|---|---|---|
| 19 teams, 3 courts x 9 slots | 171 | 0 | 0.4 s |
| 25 teams, 4 courts x 9 slots | 281 | 0 | 0.8 s |
| 31 teams, 5 courts x 9 slots | 499 | 0 | 1.0 s |

The same trick finds 13 teams on 3 courts x 6 (also fully booked) at
once, but it says no to 13 teams on 2 courts x 9, which the whole-season model
had already solved. So it is a shortcut for some sizes, not a proof for any.
The construction works whenever the number of teams is one more than a
multiple of six (7, 13, 19, 25, 31, 37...). Odd sizes like 29 need a
different group.

The script is `eval/odd-orbit.py` in the venture's folder, and the
measurements are in `eval/odd-orbit.txt`. All three new seasons are stored in
`odd-designs.mjs`, so a league of that size gets them with no search.
