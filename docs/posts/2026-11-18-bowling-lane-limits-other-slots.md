---
title: "A bowling schedule the SAT solver called impossible, solved by moving two teams in the draw"
seo_title: "Bowling lane limits: an impossible draw solved by moving teams"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "A lane-limit season a SAT solver proved impossible had an answer once the two limited teams took other places in the round robin. What that means for organisers."
---

The [bowling page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
of the league schedule generator takes **lane limits**: a team that must never bowl on a given
pair of lanes, such as the pair by the wall where a bowler with a walker has no room. It keeps
the limit and still tries to give every team its even share of the other pairs.

For the hardest season lengths the page uses answers a SAT solver worked out in advance, one per
*shape* of limit ("two teams off the same pair", "one team off both end pairs"). Balance does not
care about names, so one stored answer serves every league with that shape: the page puts the
limited teams in the right places in the round robin and renames the pairs.

## "Impossible" was about the draw, not the season

Two of those shapes came back UNSAT, which is a proof that no lane rotation exists. 20 teams
over 9 weeks with two teams off one pair was one of them. But the proof was about one draw: the
two limited teams sat in the first two places of the circle method, the standard round-robin
rotation.

In a season shorter than a full round robin, the places matter. Who a team meets in the first 9
weeks, and how often it meets the one team the rotation holds fixed, depends on its place. So
the same shape on other places is a different question. Moving the second team along:

| places of the two limited teams | answer |
|---|---|
| 1st and 2nd | none (UNSAT) |
| 1st and 3rd, 4th, 5th | none (UNSAT) |
| 1st and 6th | found in 2.5 seconds |

The fixtures are still a plain round robin, every team meeting every other once. Only who is
dealt which place changes, and the organiser never sees places, only names. The page now
stores answers with their places (`0:0;5:0`), and 20 teams over 9 weeks with two teams off one
pair goes from 17 of 20 teams on their even share to 20 of 20. The other UNSAT shape (18 teams
over 8 weeks, two teams each off the same two pairs) fell the same way, on places 13 and 18.

## A timeout that needed no solver

22 teams over 23 weeks with two teams off one pair had timed out after 300 seconds of SAT
solving. The page's own lane search, run on the stored shape's places instead of the
organiser's order, already lands every count in target. The miss came from the draw again: with
the limited teams wherever the organiser typed them, the search came up 2 counts short.

## What is left

RESULTS_POST

## For organisers

If the page says a team is one game off its even share of the pairs under a lane limit, try
"Try another lane deal", and, for the cases above, nothing: the page now finds the even
schedule by itself. The measurements and scripts are in the
[venture's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
("Lane limits: shapes stored on other slots").
