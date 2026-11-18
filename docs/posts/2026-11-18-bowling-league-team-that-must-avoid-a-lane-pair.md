---
title: "Bowling league schedules: keeping a team off a lane pair without breaking the rotation"
seo_title: "Bowling league schedule with a team that avoids a lane pair"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "The free bowling schedule maker now keeps a team off a lane pair every week as a hard rule. Measured on 142 seasons against the usual hand fix."
---

Plenty of bowling leagues have one team that cannot use one pair of lanes. A bowler with a walker
has no room on the approach of the end pair by the wall. A team asks to stay away from the pair by
the bar. The [bowling league schedule
page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html) already
rotates every team across the lane pairs as evenly as the season allows. Today it also takes
**lane limits**: one line per team, such as `Pin Pals: 7-8`, `Spare Me: last` or
`Gutter Gang: ends` for both end pairs. That team never lands on that pair, in any week.

## The usual fix, and why it drifts

The way an organiser does this by hand is to build the even schedule first. Then, each week the
team lands on its pair, they swap its match with the one next door. That keeps the limit, but every
swap moves two matches, four teams, onto different pairs, and nothing puts the counts back. We ran
that fix on 142 seasons (6 to 24 teams, 26 to 34 weeks, four kinds of limit). It left some team off
its fair share in **every one** of them, 3,345 counts off in total. In 3 weeks it found no swap that
kept the limit at all.

## Limits inside the search

The page's lane search has three stages: a week-by-week assignment (the Hungarian method), a
season-wide re-solve of each week with the others fixed, and a focused random walk for the last few
counts. A limit is now a hard rule in all three. A banned match-on-pair cell costs more than every
balance price combined, so the exact week step never takes one when the week has any legal deal.
Because that step is exact, a banned cell in its answer is also a proof that the week has *no*
legal deal. Then the page refuses the season and names the week, rather than quietly breaking a
limit. (In a 4-team league, three teams avoiding the same pair is enough.)

"Even" also needs a new meaning. The avoided pair still hosts a match every week, so the other
teams have to bowl on it a little more often. The page works out each team's fair share by
scaling a matrix: every team gets its number of weeks, every pair gets its number of slots, and
banned cells get zero. The target is each share rounded down or up. With no limits that reduces
exactly to the old rule, and the 48 seasons we compared came out identical to before.

## How it measured

| | every team in its fair share | counts off | back-to-back repeats | limits broken |
|---|---|---|---|---|
| hand fix | 0 of 142 seasons | 3,345 | 3,438 | 3 weeks |
| page | 133 of 142 | 24 | 2,338 | 0 |

It takes about 0.8 s a season in the browser. A SAT solver checked the misses. Four (6 teams on 3
pairs with two teams off the end pair, or one team off both ends) cannot reach the target at all,
so the page's result is as close as any deal gets. Four more, all 20 teams over 30 weeks, have a
deal the search did not find. That is the same season length that needed a stored solver answer
before limits existed, and it is the next thing to close.

One gap stays manual. Position rounds (1st v 2nd by the standings that night) put places on pairs
in order, and their teams are known only on the night. The page says to check a limited team's
pair on those weeks.

The scripts and full tables are in the project's `eval/bowling-lane-avoid.txt`, and the page is
free and runs entirely in your browser.
