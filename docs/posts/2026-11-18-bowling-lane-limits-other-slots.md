---
title: "A bowling schedule the SAT solver called impossible, solved by moving two teams in the draw"
seo_title: "Bowling lane limits: an impossible draw solved by moving teams"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "A lane-limit season a SAT solver proved impossible had an answer once the two limited teams took other places in the round robin. What it means for organisers."
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

The other four timeouts were 20 teams over 40 weeks and three shapes on 24 teams over 13 weeks.
Moving teams did not help there at first (four places tried for one 24 x 13 shape, 2 minutes
each, no answer). What did was telling the solver something it could not see for itself: the lane pairs
no limit names are interchangeable, so any answer can be relabelled to put week 1's matches on
them in order. Adding that one rule cut the search enough to answer three of them in 1.5 to 10
minutes. The fourth, two teams off one pair on 24 x 13, still ran 30 minutes with no answer
until the second team moved to the place the rotation holds fixed: then 110 seconds.

A repair approach, starting from the page's near miss and re-solving a few weeks at a time, got
nowhere on two of them (still 2 counts off after 25 minutes), so it stays a script, not part of
the page.

On the 112 hardest measured seasons, the page now gives every team its even share of the pairs
it may use in **112 of 112** (it was 106). On a wider grid of 142 seasons with lane limits it is
139 of 142. Of the three left, one is now proved impossible for every draw, not just one: 6
teams over 32 weeks with one team off both end pairs is UNSAT on all six places. Another (6
teams over 32 weeks, two teams off the last pair) is UNSAT on 14 of the 15 ways to place the two
teams, and the last way is still unanswered. The third (6 teams over 26 weeks, three teams with
random limits) is UNSAT on its draw; other places for its three teams are not tried yet.

The lesson for anyone writing a scheduling solver: an UNSAT on one encoding is a proof about that
encoding. If your model fixes an arbitrary choice the user never made (here, which teams sit in
which places of the rotation), the proof says nothing about the problem the user has.

## For organisers

For the seasons above there is nothing to do: the page now finds the even schedule by itself.
Where it still reports a team one game off its share under a lane limit, that is either proved
the best any schedule can do or, for the two open cases, not yet known. The measurements and scripts are in the
[venture's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
("Lane limits: shapes stored on other slots").
