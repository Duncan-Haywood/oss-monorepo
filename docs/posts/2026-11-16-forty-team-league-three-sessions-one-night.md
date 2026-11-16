---
title: "A 40-team league in three sessions a night, solved by writing down one night"
seo_title: "Wait-free schedules for 40 and 46 teams, three sessions a night"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "A SAT model that timed out at 300 s for 40 and 46 teams solves in 0.1 s once a cyclic renaming turns one night into the whole season."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can build seasons where every team plays its three games of the night back to back
and then goes home, with no empty slot in between. With nine time slots that means
three sessions a night: early, middle and late. When the courts are tight, every
night has to split into three closed groups of teams that only play each other.

The generator gets those nights from stored designs, round robins a SAT solver
wrote ahead of time. Until today two even sizes had none: 40 teams on 7 courts and
46 teams on 8. The solver ran out of its 300 seconds on both. Leagues of those sizes
had 794 and 1,201 waits over three test seasons, and each build took 12 to 18
seconds while the tool searched for something better.

## Ask for one night, not a season

The whole-season model asks for 39 or 45 rounds and every night's grouping at
once. This run asked for one night instead and got the other nights by renaming
the teams.

Number 39 of the 40 teams 0 to 38 and leave the last one alone. Renaming every
team t to t + 3 (mod 39) has order 13: do it 13 times and everyone is back where
they started. No pair of teams is ever renamed onto itself before that, so the 780
possible pairs fall into 60 families of 13. One night of three rounds has
3 x 20 = 60 matches. So if a night uses exactly one pair from each family, its 13
renamings use every pair exactly once. That is the whole round robin: 13 nights of
three rounds, 39 rounds. Each renamed night has the same three groups, just with
different names in them.

The SAT model now covers one night: about 10,000 variables for 40 teams. It solves
in 0.1 seconds. 46 teams works the same way (45 = 3 x 15, so 15 nights of three
rounds) and also solves in 0.1 seconds.

| Teams | Courts x slots | Waits before (3 seeds) | Waits now | Build time before / now |
|---|---|---|---|---|
| 40 | 7 x 9 | 794 | 0 | 18.5 s / 1.5 s |
| 46 | 8 x 9 | 1,201 | 0 | 11.8 s / 2.1 s |

With these two stored, every even league from 14 to 48 teams gets a wait-free
season at nine slots on the fewest courts that could hold it. The one exception is
12 teams on 2 courts, which an earlier run proved impossible.

## Where it stops

The trick needs n = 3k + 1 teams with k odd. The same script solves 52, 58 and 64
teams in 0.3 seconds each, but the tool's stored designs stop at 48 teams for now.
When k is even (14, 26 and 38 teams), some pairs repeat after k/2 renamings and the
count no longer comes out even. Those sizes already reach 0 waits by other routes.
The odd-league version of this idea covers 19, 25 and 31 teams. Yesterday's run
showed why it cannot cover 29 teams, which is still open.

The script is `eval/session-orbit.py`, and the measurements are in the
venture's README under "Three sessions at 40 and 46 teams". Like the rest of the
generator, it is MIT licensed.
