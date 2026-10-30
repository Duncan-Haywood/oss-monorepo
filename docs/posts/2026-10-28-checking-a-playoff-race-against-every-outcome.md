---
title: "Checking a play-off race calculator against every possible outcome"
date: 2026-10-28
description: "The league schedule generator says who has clinched or is out. A brute-force check over 900 random part-played leagues found no disagreement."
tags: [league-schedule-generator, testing, sports]
---

The league schedule generator tells an organiser which teams have clinched a
play-off place and which are out. A wrong "clinched" is the kind of mistake a
club notices at the worst moment, so this run checked it the blunt way.

`eval/fuzz-race.mjs` builds random part-played leagues (3 to 7 teams, up to 8
fixtures left, two points systems, point adjustments, any number of spots). It
plays out every win, draw and loss for the remaining fixtures, up to 6,561
outcomes a league, and records each team's best and worst finishing rank. It
compares those with `playoffRace`. It also checks that the fast bounds route,
used when too many fixtures remain to enumerate, never claims more than the
exact one, and that the Monte Carlo odds give 100% to clinched teams, 0% to
eliminated ones and add up to the number of spots.

Result over three seeds of 300 leagues (about 4,400 team rows): no
disagreement. The check is pinned in the test suite. It covers points ties
only; the race counts a tie against the team by design, so goal-difference
tie-breaks are not tested here.
