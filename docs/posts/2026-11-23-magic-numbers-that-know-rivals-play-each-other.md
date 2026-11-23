---
title: "Magic numbers that know your rivals still play each other"
seo_title: "Exact magic numbers for league standings, checked on 18 seasons"
date: 2026-11-23
tags: [league-schedule-generator, sports, standings, algorithms, open-source]
description: "The league page's 'more points clinch it' column is now exact. On 18 real football seasons it was smaller on 30,085 team-dates and never wrong."
---

Every league table in the [League Schedule Generator](../../ventures/league-schedule-generator/)
has a race column: who has clinched a place, who is out, and for the rest how many more
points clinch it. That last number, the magic number, had a shortcut in it. It let every
rival win all of its remaining games at the same time, including the games rivals play
against each other. That cannot happen, and in a big league it made the number far too high.

A team in a 20-team league fighting to stay up was told to find points that only exist if
the other 19 teams all win out against each other. So the number was safe but useless for
most of the season.

## What changed

The number is now the smallest total that clinches a place however the team gets it: wins
against the teams chasing it (which also takes points off them), draws, any mix. A tie on
points at the cut still counts against the team, the same rule the "clinched" label uses, so
the number never promises what a tie-break could take away.

Under the hood it is a branch-and-bound search, asked total by total from "win every game"
downwards: can the other teams still push this one out if it ends on exactly this many?
Two things keep it fast. Teams already over the line, or unable to reach it, have their
games settled the way that hurts the team most, so only games between teams still in doubt
branch. And there is a supply cut: the games left can hand the chasers at most one game's
worth of points between two of them, so only as many chasers can catch up as the points on
offer cover. Each team gets a fixed amount of search. Where it runs out, the old safe number
stands.

One smaller fix came with it. The old column could say "2 more points" to a team with one
game left under 3-1-0 scoring, where the only totals are 0, 1 and 3. It now always names a
total the team can actually score.

## Checked how

- Against a brute force over every possible finish on 300 random small leagues (three
  scoring systems, point deductions): equal for every team.
- On 18 real top-flight seasons (openfootball data, CC0), replayed match date by match date
  for the title, the top four and safety: 98,622 cases of a team still in a race. In 11,385
  of them the team went on to take its magic number of points, and every one finished in the
  places. The new number was never higher than the old one. It was smaller on 30,085 of them
  and gave a number on 13,689 where the old method had none. In the safety race it was 18.9
  points smaller on average.
- The cost: the race table takes 86 ms on average instead of 14, in the browser.

What it does not check yet: magic numbers a real league or broadcaster has published, and
tie-breaks on goal difference or head to head inside the number.

The page is free and MIT licensed, and the results stay in the browser. The working is in the
venture's README ("Magic numbers, exact") and `eval/magic-real.txt`.
