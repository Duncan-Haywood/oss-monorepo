---
title: "Five bowling teams that can't use the wall pair: why the first legal schedule isn't the fairest"
seo_title: "Bowling lane limits: pick the most even schedule"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "With five or more bowling teams kept off a lane pair, comparing several legal dealings instead of taking the first lifts fully even seasons from 37 to 42 of 48."
---

Some bowling teams can't use every pair of lanes. The pair by the wall may be too tight for a bowler
with a walker, or one pair may sit too far from the bar for the team that runs it. The
[bowling page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html) of the
league schedule generator takes those limits as hard rules ("Hawks: not lanes 9-10") and still tries
to give every team its even share of the remaining pairs.

When four or fewer teams have limits, the page uses answers stored in advance for that shape of
limit. With five or more it has to search. The round robin is fixed (every team meets every other
team as often as before), but which team gets which slot in it, the *dealing*, is free. The dealing
decides who meets whom in each week, and so whether the limited teams pile into the same weeks.

## What changed

Until today the page kept the **first** dealing that had a legal lane plan every week. It now builds
the season on several legal dealings and keeps the most even one. Seasons are compared by teams
outside their fair share first, then by how far outside, then by weeks spent on the same pair as
the week before. It stops as soon as every team is in target. The number of dealings it tries
depends on the league's size: up to six for a 10-team league, two for 24 teams, because each try is
a full lane search.

## Measured

The same 112 test seasons as before: 10 to 24 teams, 26 to 34 weeks, four kinds of limit with five
to eight limited teams. The script is `eval/bowling-many-limits.mjs` in the venture, and the
"before" run used the previous code on the same day.

| limit | seasons with every team at its even share | off-share counts |
|---|---|---|
| five teams off the last pair (28 seasons) | 22 -> 25 | 11 -> 4 |
| six teams off both end pairs (20 built) | 15 -> 17 | 23 -> 8 |
| five or eight teams, a random pair each (56) | 56 -> 56 | 0 -> 0 |

A 10-team, 26-week league with five teams off the last pair went from two teams short of their
share to none. A 16-team, 30-week league with six teams off both end pairs went from four teams
short to none. No season got worse, and no limit was broken.

The cost is time. The average season took 1.6 s instead of 1.2 s on the test machine, and the
slowest (24 teams, 26 weeks, six teams off both ends) took 10.7 s instead of 5.0 s. Trying six
dealings everywhere would have won one more season of each kind, but one season took 25 s. The cap
is a trade-off, and the measurements are in the venture's README.

## What's left

Seven seasons still have a team or more off its share: 10 teams over 32 and 34 weeks, 14 teams x 30,
and 24 teams x 26. Each needs more dealings than the cap allows, or a solver answer stored for
these larger limit shapes. The bowling page also builds on the page's own thread. The round-robin
page already runs its search in a worker, and the slowest bowling seasons should too.

These are synthetic leagues. No real league's lane list has been through it yet. If you run a
bowling league whose teams can't use certain pairs, the page is free and runs in your browser, so
try it on your own lane list.
