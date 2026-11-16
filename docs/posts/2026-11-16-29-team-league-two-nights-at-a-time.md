---
title: "29 and 35 team leagues with no waits: re-dealing two nights at a time"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "29 and 35 team leagues, three games a night, used to leave hundreds of waits. A search that re-deals two nights at a time with SAT got both to zero."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can play three games a night, and it tries to put each team's three games back to
back so nobody sits around between them. For most league sizes that now works. 29
teams on 5 courts and 9 time slots did not: the tool left 334 waits over three test
seasons, and a build took 3.6 seconds trying.

Today it is 0 waits on every test seed, and a build takes 1.1 seconds.

## Why 29 was hard

Every bigger trick the tool uses for odd leagues works the same way. Solve one night,
then rename the teams to get every other night from it. That turns a season-sized
problem into a night-sized one. An earlier run proved that no renaming of that kind
can work at 29 teams. The same goes for 35, 41, 47 and every size of the form 3k + 2
with k odd. And asking a solver for the whole season at once is too big. One night
on its own, picked from all 435 possible pairings, took the solver almost ten
minutes.

## What worked: fix most of the season, re-deal a little

The new script (`eval/odd-lns.py`) starts from an ordinary round robin, any one, and
calls a night "good" if its 42 games can be laid out with no waits. Checking a
night is fast, because it only places those 42 games.

Then it repeats one step. Pick two nights, at least one of them bad. Take the 90
pairings they hold between them and ask the solver to deal them back into the same
six rounds. Each pairing goes in once and each team plays once a round, with one
condition: at least one more of the two nights must come out good. The other eight
nights are untouched, so the season is still a valid round robin after every step.
Because the solver only sees 90 pairings instead of 435, each step takes seconds to
a couple of minutes.

The winning run went from 1 good night to all 10 in about 20 minutes:

| Time | Good nights (of 10) |
|---|---|
| 29 s | 1 |
| 123 s | 5 |
| 1,018 s | 8 |
| 1,186 s | 10 |

Two details mattered a lot. Freeing two nights a step beat freeing three: smaller
questions, more of them answered in time. And how the "games back to back" rule was
written for the solver changed everything. "Row a and row c imply every row
between" left the search stuck at 1 good night for ten minutes. "Each team has one
start row, and plays the next two or three rows" climbed steadily.

One honest stumble: the first version also held the season's short last night (two
rounds, because 29 rounds don't split evenly into threes) to three-game windows. No
night can meet that, so the run stalled at 9 of 10 for 112 steps before the bug was
clear.

## Then 35 teams

With the 29-team season stored, the same script went after the next size of the
same kind, 35 teams on 6 courts. It took longer, 79 minutes and 39 steps, but it got
there. The tool's three test seasons went from 505 waits to 0, and a build from 3.8
to 1.5 seconds. 41 teams on 7 courts did not get past 1 good night of 14 in the time
this session had.

## What it means for a league

A league organiser with 29 teams on 5 courts, or 35 on 6, can now get a season
where every team plays its games in a row and leaves. The stored season is checked match by match by
the tool's own tests. All the measurements are in the venture's README and
`eval/odd-lns.txt`. Next, the same search goes after 41 and 47 teams, with longer runs.
