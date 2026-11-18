---
title: "44 bowling league seasons where no lane rotation can be even, proved by a SAT solver"
seo_title: "Bowling league seasons no lane rotation can even out"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "Some bowling seasons can't give every team its even share of lane pairs. A SAT solver proved 44 of them; a season as long as the lane pairs is the usual one."
---

A bowling league bowls on the same lanes every week, one pair of lanes per match, and bowlers
notice when their team keeps getting the pair by the wall. The
[bowling page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html) of
the league schedule generator rotates teams across the pairs: a team that bowls 30 weeks on 5
pairs should get each pair 6 times. In general a team that bowls W weeks on P pairs should get
each pair W/P times, rounded down or up. Call that the even split.

Yesterday's post said the page's search reached the even split for every team in 30 of 36
measured seasons, and that a SAT solver showed the other 6 could be even. That raised the
opposite question. **Are there seasons where no rotation at all can be even?** If so, the page
was showing "best possible 0" next to a team that could never get there, which reads as a
mistake when it isn't one.

## What was checked

Every even league from 4 to 32 teams, for every season of 1 to 60 round-robin weeks: 900
seasons. A lane search ran on each, and 145 came back with some team off the even split. Each of
those went to a SAT solver (CaDiCaL, through python-sat) as a yes/no question about the exact
weeks the page plays: one pair per match and one match per pair each week, and every team on
every pair the rounded-down or rounded-up number of times.

A "no" from the solver (UNSAT) is a proof about the season, not about the search: whatever
search anyone writes, those weeks cannot be dealt evenly. Any such season is missed by every
search, so checking one search's misses finds them all. The only gap is seasons the solver did
not settle in its time limit.

| verdict | seasons |
|---|---|
| no even deal exists (proved) | 44 |
| an even deal exists (the search missed it) | 17 |
| not settled in 20 to 150 seconds | 84 |

## The seasons that can't be even

**A season exactly as long as the lane pairs.** 8 teams on 4 pairs for 4 weeks, 16 teams on 8
pairs for 8 weeks, and so on: every size from 4 teams (2 weeks) to 30 teams (15 weeks) is
impossible. Each team would need every pair exactly once, and the round robin's first P weeks
never allow that. (32 teams for 16 weeks was not settled.) So a league that plays one short
first half and then position rounds should expect a team or two to see one pair twice.

**4-team leagues** are out of reach whenever the round-robin weeks are 2, 3 or 4 more than a
multiple of 6, all the way to 58 weeks. The 2-week case can be checked by hand. In week 1 the
two matches split the teams across the two pairs, so in week 2 every team has to change pair.
But each week-2 match puts one team from each pair together, and they share a pair.

**A few other short seasons:** 6 teams for 9 weeks, 8 teams for 3, 12 teams for 5.

Longer seasons at 20 to 32 teams are where the solver ran out of time. The checks that finished
there yesterday took 30 seconds and more each, so those seasons are open, not proved fine.

## What changed on the page

When a season is on the proved list, the page now says the even split is out of reach this
season, rather than "best possible". The engine exposes the same thing to code
(`boundProvedOutOfReach` on the season and on `laneReport`). Odd leagues are never flagged: they
bowl against a Vacancy, and a proof that covers the Vacancy's row says nothing about the real
teams.

The list, the solver script and the sweep that fed it are in the project's
[`eval/bowling-bound-proof.txt`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/league-schedule-generator/eval/bowling-bound-proof.txt).
A better search for the 17 seasons that can be even is being worked on separately.
