---
title: "Same breaks as the Bundesliga, far less carry-over"
seo_title: "Round robin schedule with minimum home/away breaks and low carry-over"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, open-data]
description: "Capping home/away breaks, then evening out carry-over, gives an 18-team season with the Bundesliga's 48 breaks and 38 to 50% less carry-over."
---

A home-and-away league schedule has to do two things that pull against each
other. It should have few **breaks**: a break is two home games in a row, or two
away games in a row. Fans and grounds like a steady home, away, home rhythm. It
should also have an even **carry-over**: no team should keep meeting the same
opponent straight after the same other team. Carry-over is the subject of
[an earlier post](2026-11-11-who-you-play-after-the-champions.md).

The textbook circle method gets the fewest breaks there can be and close to the
worst carry-over. The search on the
[league schedule generator](https://marisstella.app/league-schedule-generator/)
went the other way. It put a price on each break and traded breaks for
carry-over. Its weakness showed up when we raised that price: a 20-team season
never got under 88 breaks. The Bundesliga plays 18 teams with 48 breaks, which is
the least a mirrored home-and-away season can have.

## Why the price never got there

We measured leg one (the first half of the season) on its own. With 20 teams
it had 46 to 52 breaks, and the minimum is 18. With 18 teams it had 28 to 34,
and the minimum is 16. Leg two can't undo that, so the season ends up with more
than twice as many. The search started from low carry-over and tried to buy
breaks back. Each move that removed a break cost more carry-over than the price
of the break, so the search turned the move down.

## Starting from the other end

The new search starts where the circle method does, at the minimum. It then
lowers carry-over, but it refuses any move that takes the season over a set
number of breaks, or that leaves a team more than one game off an even home and
away split. Each move reshuffles who plays whom in some rounds. It can keep
every team's home and away days as they are, which is only allowed if every
match still has one home side, or it can move each match's ground with the match.

For leg two it tries three orders and keeps the best one that fits under the
cap:

- leg one backwards, which spreads carry-over well but adds a break for almost
  every team at halfway;
- leg one again with the grounds swapped (the mirror), which has the fewest breaks;
- the mirror with its first and last rounds swapped.

## What it found

Three seeds per setting, every figure recounted from the fixtures it produced
(`eval/capped-breaks.txt` in the repository):

| Teams | Breaks | Carry-over | Real fixture lists for comparison |
|---|---|---|---|
| 18 | 48 | 2,154 to 2,674 | Bundesliga 2021-22 to 2024-25: 3,474 to 4,342 at 48 |
| 18 | 60 | 1,696 to 1,858 | Ligue 1 2023-24: 1,840 at 74 |
| 18 | 72 | 1,564 to 1,704 | Ligue 1 2024-25: 1,948 at 96 |
| 20 | 54 | 4,734 to 5,080 | circle method 21,044 at 54; no top-flight season under 70 |

At 18 teams, a schedule with the same 48 breaks as the Bundesliga has 38 to 50%
less carry-over than any of the four Bundesliga seasons we checked. Those
schedules also carry derby, police and TV constraints that we don't model, so
this doesn't show that the league's planners could have done it. It shows how
much room the break minimum leaves.

The 20-team result is weaker, and we'd rather say so. With 20 teams the capped
search barely improves leg one. It ends near 1,100 to 1,400 carry-over at 18 to 22
breaks, where the unconstrained search reaches about 500. Above about 60 breaks
the older weighted search is still better. We also tried starting from the
weighted result and lowering the cap step by step. It never got away from where
it started, so we didn't ship it.

## On the page

When you tick "Spread who you meet next", the page now runs ten searches: the
eight it ran before, unchanged, and two capped ones. There is also a fourth
choice for which one to keep: **the fewest back-to-back home or away games
possible, then the most even carry-over**. Organisers who care most about
rhythm get the minimum breaks without the circle method's carry-over. The other
three choices almost never change. Across six test runs they changed once, at
18 teams, from 1,550 / 72 to 1,786 / 60. Leagues with an odd number of teams
get two more weighted searches instead, because a bye already ends a run of
home or away games and the capped search can't move one without unbalancing
someone.

All of this runs in the browser and nothing is uploaded. The code is MIT
licensed in `ventures/league-schedule-generator/carryover.mjs`. These are search
results with made-up team names: no league has played one of these schedules
yet.
