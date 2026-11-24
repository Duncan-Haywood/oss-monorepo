---
title: "Drawing divisions by map: the NFL's 32 teams with 36% less distance between rivals"
seo_title: "Divisions drawn by location: the NFL with 36% less rival travel"
date: 2026-11-24
tags: [algorithms, optimization, sports, league-schedule-generator]
description: "A new free page splits a regional league into even divisions with the least travel between rivals. On the NFL's map it finds 36% less, 17% within conferences."
---

Every regional league has the same argument before its season: who goes in
which division. Teams play at their own grounds across several towns, and
each team visits every division rival, so the split decides most of the
season's driving. The [League Schedule Generator](../../ventures/league-schedule-generator/)
now has a page for it:
[divisions by location](https://marisstella.app/league-schedule-generator/divisions-by-location.html).

You paste each team's home ground as `Team @ latitude, longitude`, pick a
number of divisions, and optionally list teams to keep apart (a club's A and
B sides) and the divisions you use now. It returns divisions of even size
with the least total distance between rivals, each team's average and
farthest trip, the saving against your current split, and a button that
opens the multi-division scheduler with those divisions filled in. It runs
in the browser and nothing is uploaded.

## A real map to test it on

To check it on real geography, we placed the NFL's 32 teams at their
stadiums' towns (town-centre coordinates from GeoNames, CC BY 4.0) and
asked for 8 divisions of 4. Distances are straight-line, town to town.

| Split | Distance between division rivals | Change |
|---|---:|---:|
| The 2025 divisions | 43,953 km | |
| Least travel, conferences kept | 36,674 km | -17% |
| Least travel, any four teams | 28,018 km | -36% |

Each pair of rivals meets twice a season, each side travelling once, so the
season's division-game travel is four times those figures: about 176,000 km
for the real divisions against 112,000 km for the least-travel split.

Some of the real divisions are historical, not geographic: the NFC East
sends Dallas to New Jersey (2,230 km), and the AFC East sends Miami to
Foxborough (1,973 km). The least-travel split keeps Dallas with Houston,
Kansas City and New Orleans, and Miami with Jacksonville, Tampa and Atlanta.
The full table is in [`eval/nfl-divisions.txt`](../../ventures/league-schedule-generator/eval/nfl-divisions.txt).

## How sure is "least"?

There are about 59 billion billion ways to split 32 teams into 8 divisions
of 4, so the page does not try them all. It runs a local search from 64
starts: each start is improved by swapping two teams between divisions
until no swap helps, then shaken and improved again. We checked it three
ways:

- **60 random small leagues** (8 to 12 teams, 2 to 4 divisions): it matched
  the best of every possible split every time, and also with keep-apart
  groups.
- **Each NFL conference**: 16 teams into 4 divisions of 4 has 2,627,625
  splits, few enough to check all of them. The search found the exhaustive
  best in 64 of 64 starts for both conferences.
- **The whole league**: 89 of 400 starts reached the 28,018 km split. A
  branch-and-bound proof with a simple bound did not finish in ten minutes,
  so for 32 teams that number is the best found, not a proved minimum.

## What it leaves out

It measures straight lines, not roads, and it does not balance team
strength or plan multi-game road trips. For a youth or rec league spread
over a county, straight-line distance ranks splits much the same way road
distance does, and the result is a proposal for the league meeting, not a
ruling. If you run a regional league and want to try it on your own grounds,
the page is free and needs no account.
