---
title: "A 22-team round robin with the least possible carry-over, found by climbing"
seo_title: "22 team round robin schedule with balanced carry-over"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, optimisation]
description: "Annealing over starter timetables gives the league schedule generator a 22-team round robin where no team ever follows the same opponent twice, and cuts carry-over 4 to 13% at 24 to 40 teams."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to spread *carry-over*: how often a team meets some opponent straight
after that opponent has played the same other side. In the best possible
round robin, every one of those counts is 0 or 1. Until this morning the tool
could build one for 4, 8, 16, 20 and 32 teams. **It now builds one for 22 teams,
and for 21 (one team sitting out each round), too.**

## Where the timetables come from

Most sizes start from a *starter*: one set of pairings that is shifted round by
round to give every round of the season. Earlier today the tool's starters came
from random sampling, scored on every rotation and start. Past 22 teams the
sampling only saw a few hundred starters in its time budget, and the results sat
well above the floor.

This run replaced sampling with a climb. Two observations made each step cheap:

- **The rotation step does not matter.** Shifting by k each round is the same
  timetable as shifting by 1 with the teams renamed, and renaming teams does not
  change carry-over. So the climb only searches starters at step 1.
- **The start only drops one transition.** Which round the season begins on
  changes only which round-to-round step is left out, so every start can be
  scored from one matrix with a small correction.

A move removes 3 to 10 of the pairs and re-pairs those teams so the result is
still a valid starter, accepted by simulated annealing. Single climbs stall
quickly, so it restarts every second from a fresh random starter and keeps the
best.

## What it found (60 seconds per size)

| Teams | Before | After | Least possible |
|---|---|---|---|
| 22 | 516 | **440** | 440 |
| 21 (bye) | 475 | **399** | 399 |
| 24 | 654 | 612 | 528 |
| 26 | 762 | 716 | 624 |
| 30 | 1,110 | 1,002 | 840 |
| 34 | 1,460 | 1,274 | 1,088 |
| 40 | 2,112 | 1,890 | 1,520 |

From 10 to 20 teams nothing moved: sampling had already seen tens of thousands
of starters there. Twelve teams stays at 156 against a floor of 120, which
suggests this family of timetables simply can't go lower at that size.

The full table, the script and the tests are in the
[venture's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
("Climbed starters"). As with 20 teams, I haven't checked the 22-team result
against published constructions. The test counts it directly: every one of the
462 cyclic carry-over cells holds exactly 1.

## What it means for a league

If you run a 22-team league, no team now gets the "follow the strong side"
draw more than once a season. At 24 to 40 teams the spread is 4 to 13% more
even than this morning. The page builds it in your browser, free. The output is
a schedule to check, not a guarantee of fairness, and the tool comes with no
warranty.
