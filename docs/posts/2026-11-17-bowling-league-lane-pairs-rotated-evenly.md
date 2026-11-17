---
title: "A bowling league schedule where every team gets every lane pair evenly, and where the search still falls short"
seo_title: "Bowling league schedule with lane pairs rotated evenly"
date: 2026-11-17
tags: [ventures, league-schedule-generator, operations-research]
description: "A free bowling league schedule maker: lane pairs rotated evenly over a repeated round robin. Even in 30 of 36 measured seasons; SAT shows the other 6 can be."
---

Weekly bowling leagues are a fixture of most bowling centres, and their schedule has
a problem a soccer or darts league does not have. A bowling league bowls on the same lanes every
week, one pair of lanes per match, and the season is long: 30 weeks is common, so a 10-team
league plays its round robin three times and a bit. Who bowls whom is easy. The lanes are the
hard part. Bowlers notice when their team keeps getting the pair by the wall, and a sheet that
copies the round robin straight onto the lanes puts one team on the first pair every single week.

The [league schedule generator](https://marisstella.app/league-schedule-generator/) now has a
[bowling page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
that builds the whole season in the browser: dates with holidays skipped, weeks kept for position
rounds (1st bowls 2nd by the standings that night), a vacancy for an odd league, lane numbers
from wherever the league's lanes start, and a lane pair for every match chosen so each team's
counts come out even. It shows every team's weeks on each pair, so the secretary can see the
balance before the sheet goes out.

## How even can it be?

A team that bowls 30 weeks on 5 pairs can have each pair exactly 6 times. With 33 weeks on 4
pairs the best is 8, 8, 8 and 9. Call that "at the bound". We measured four ways of putting the
same round robin on the lanes, over 36 seasons (6 to 24 teams, 26 to 34 weeks):

| assignment | seasons with every team at the bound | worst gap between a team's most- and least-used pair |
|---|---|---|
| copy the round robin onto the lanes | 0 of 36 | 34 weeks |
| move every match one pair along each week | 1 of 36 | 13 weeks |
| week by week, each week solved as an assignment problem | 4 of 36 | 3 weeks |
| that, then an iterated local search (the page) | 30 of 36 | 2 weeks |

The search uses the fact that one week is easy on its own. With every other week fixed, the
cost of putting a match on a pair splits into a price per match and pair, so the Hungarian
method gives that week's exact best. The page sweeps the season until no week improves, then
re-deals a few weeks at random and sweeps again, keeping the most even season it has seen. It
takes about half a second.

## The six it misses

In 6 of the 36 seasons some team ends two weeks off rather than one. Is that the most even
possible for those league sizes? No. A SAT model of the same question (each match on one pair,
each pair used once a week, each team's count on each pair inside the bound) finds a perfectly
balanced assignment for all six: 10 teams over 30 weeks, 12 over 30, 16 over 32, 18 over 26, 20
over 30 and 24 over 34. So the gap is the search's, and it is written down as the next thing to
close. We also wrote down what did not help: a swap search, guided penalty weights, and starting
from a balanced first cycle with the lane labels shifted each cycle all landed at or below the
plain search.

The scripts, the full table and the SAT runs are in the project's
[README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
(`eval/bowling-lanes.txt`, `eval/bowling-lane-sat.txt`). The page is free, needs no account,
and nothing you type leaves the browser. Check every pairing and lane before you announce it;
your league's and your bowling centre's rules come first.
