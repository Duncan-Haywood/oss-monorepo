---
title: "Wait-free nights for 33 to 63 team odd leagues: one night laid out is the whole season"
seo_title: "Wait-free schedules for big odd leagues (33 to 63 teams)"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "Odd leagues of 33 to 63 teams on nine time slots went from thousands of waits to none, because one solved night repeats as the whole season."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
takes up to 64 teams. Until today, though, its wait-free promise for odd leagues
with three games a night stopped at 31 teams. "Wait-free" means each team plays
its three games back to back and then goes home. A 63-team league on 11 courts
and nine time slots got 2,643 waits over three test seasons. Every one of those
is a team sitting around between games.

This run fixed six league sizes: 33, 39, 45, 51, 57 and 63 teams, on the fewest
courts that can hold them. All six now get zero waits on every test seed.

## The trick: shift one night

Number the teams 0 to *n* - 1, plus a "sits out" slot. The circle method used to
build round robins is *1-rotational*: round *r* + 1 is round *r* with 1 added to
every team number, mod *n*. So any night made of rounds {*s*, *s* + 1, *s* + 2}
is the night {0, 1, 2} with every team renamed. If that one night can be laid out
with nobody waiting, the same layout works for every shifted copy, with the names
changed.

When *n* is a multiple of 3 (33, 39, ..., 63), the shifted copies of {0, 1, 2}
cover all *n* rounds exactly, with no short night left over. So the whole season
comes down to one small question for a SAT solver: lay out about 1.5*n* matches
in nine rows, at most one match per court in a row, each team's games in rows
next to each other. On the fewest courts these nights have six spare slots
(48 matches in 54 slots at 33 teams), and the solver found a layout on the first
try every time, in 0.2 to 7 seconds:

| Teams | Courts x 9 slots | Waits before (3 seeds) | Waits now |
|---|---|---|---|
| 33 | 6 | 377 | 0 |
| 39 | 7 | 583 | 0 |
| 45 | 8 | 966 | 0 |
| 51 | 9 | 1,354 | 0 |
| 57 | 10 | 1,896 | 0 |
| 63 | 11 | 2,643 | 0 |

Builds also got 3 to 7 times faster, because the tool now reads the stored rows
instead of annealing a layout: 63 teams went from 7.0 seconds to 1.9.

One more size fell to a different trick. 37 teams on 6 courts x 9 slots is *fully
booked*: 54 matches in 54 slots, with no spare slot to absorb a bad night. There the
shifted-night trick has never laid out a fully booked night (13, 17, 19 and 25
teams were tried before), so it went to the turned-night construction from the day before. It renames the teams with three rotating rings of 12. The solver took 46
minutes, sharing the machine with other runs, against 10 minutes for 31 teams, and 37 teams went from 701
waits to 0.

## Where it stops, and why that's the same wall as yesterday

The other odd sizes don't fall to this. Leagues of 3*k* + 2 teams (35, 41, 47)
have only three spare slots a night, and no shifted night laid out before the
runs were stopped. That's the class of [this morning's 29-team
post](2026-11-16-why-29-team-leagues-resist-one-turned-night.md), which proved
that no renaming group of order *k* can build their seasons. At six time slots
every odd size above 29 teams is fully booked or three slots short of it, and
nothing laid out there either (31 teams on 8 x 6: 290 night patterns tried, none
laid out).

So the next useful result isn't any particular size. It's a method for nights
with almost no spare room, and 29 teams is the smallest case to try it on.

Everything is in the repository: the designs in `odd-designs.mjs`, the solver runs
in `eval/odd-cyclic.txt`, and `node eval/odd-cyclic-check.mjs 63:11:9` to rerun the
before and after.
