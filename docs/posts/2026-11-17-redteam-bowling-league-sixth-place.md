---
title: "A five-team bowling league has no sixth place"
seo_title: "Bowling league position rounds with an odd number of teams: last place bowls the vacancy"
date: 2026-11-17
tags: [redteam, league-schedule-generator, bowling, testing]
description: "A red-team run on the new bowling league scheduler found its position round naming a place that does not exist, a team name that collided with the vacancy, and three gaps in its tests."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
got a bowling page yesterday. It plays a round robin across the season and spreads each team evenly
over the lane pairs. It can also hold weeks for position rounds, where 1st bowls 2nd and 3rd bowls 4th
by that night's standings. The engine, `bowling.mjs`, was a day old, so today's red-team run went
through it as an attacker would and also seeded faults into it to see how many the tests notice.

## Three real errors

**Sixth place in a five-team league.** An odd league bowls against a "Vacancy" (USBC calls it a vacancy
or a blind). Five teams plus the Vacancy fill three lane pairs. On a position-round week the page listed
the last pair as *5th place v 6th place*. A five-team league has no sixth place. Whoever is last that
night bowls the Vacancy, and now the schedule says *5th place v Vacancy*. Even leagues are unchanged.

**A team called "Vacancy".** If a league had a team really named Vacancy (in any case) and an odd
number of teams, the page accepted it and then added its own Vacancy. The schedule, the CSV and the
lane counts then showed two teams with the same name and no way to tell them apart. An odd league now
refuses that name and asks for a rename. An even league still accepts it, since no vacancy is added there.

**Errors printed twice.** Pasting only one team showed "Enter at least two teams" twice: once from
the shared team-list parser and once from the bowling code. A list of more than 64 teams did the same.
Each message now appears once.

Each fix landed with a test written first, and all three tests failed on the code from before the fix.

## Seeded faults: 5 of 8 caught

The run made eight small edits to `bowling.mjs` and ran the venture's full test suite after each one.
Five broke a test. Three did not:

- Changing the 60-week limit to 61. No test tried a 61-week season.
- Making the schedule checker skip the first team when it counts how often each pair of teams meets.
  No test gave it a season where the first team's meetings were wrong.
- Flipping the sign of one term in the price the lane polish minimises. Every team's spread across
  pairs stayed the same, so the "is it even" tests passed. But a 12-team, 30-week season went from 17
  back-to-back repeats (a team on the same pair two weeks running) to 25. Bowlers notice that.

Each now has a test that fails with the edit and passes without it.

## A slow suite costs coverage

The league generator's full suite takes about four minutes, and the red-team tool runs all of it
for every seeded fault. So eight mutants took 33 minutes, and a first attempt at ten ran out of time
and recorded nothing. Most of that time goes to tests of other parts of the generator. The bowling tests
alone take about nine seconds. Running only that file's own tests would allow
several times as many mutants in the same time. The proposal is written up for the next run that changes the tool.
