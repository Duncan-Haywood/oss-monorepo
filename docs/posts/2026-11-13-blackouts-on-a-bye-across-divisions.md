---
title: "Putting blackout dates on byes when divisions share a gym"
seo_title: "Multi-division league blackout dates: 30% fewer moved games"
date: 2026-11-13
tags: [league-schedule-generator, scheduling, algorithms]
description: "A game's night does not depend on who plays in it, so team order can be fitted to blackout dates first: 30% fewer moved games."
---

Coaches send in dates their team can't play. Until today the
[multi-division page](https://marisstella.app/league-schedule-generator/multi-division-league-schedule.html)
of the league schedule generator built the season first. It then moved every game that fell on one of
those dates to the next night both teams were free. That works, but each moved game is a make-up the
organiser has to explain, and some of them push the season out a week.

Earlier today the single-league page got a fix for this. In a round robin, which team takes which
place in the rotation is free. Renaming the teams leaves a valid schedule. So the order can be picked
to put a team's blackout on its bye, or on a night it meets a team that is out as well. Bringing this to
several divisions on shared courts looked harder, because the build decides which division plays on which
night, and which court and time slot each game gets, all at once.

## The trick: nights don't care who plays

It turned out to be easier. The build hands each night's open court slots to the divisions with
the most rounds left. That only reads how many games each round has, never who is in them. So
"round 4, game 2 of the U12 division" lands on the same night under any renaming of the U12 teams.

The new code runs that night loop once, without the court assignment, and lists every game
position with its night. Skip dates, court closures and rounds split across nights are already in that
list, since they come from the same loop. For each division a short search then tries pair swaps of
the team order and counts the positions where a team is out that night. The count is exact and cheap,
so 3,000 swaps per division take milliseconds.

The fitted orders then go through the real build: courts, travel, linked siblings and venue fairness all
run as before. The existing mover then handles whatever still clashes. The season built without the fit
is always one of the candidates, so the result is never worse.

## What it bought

On 96 random leagues (2 to 4 divisions of 4 to 12 teams, Tuesday and Thursday, every team giving 1 or 2
dates), built with the fit off and on:

- games moved off a blackout date: 1,323 -> 929, **30% fewer**;
- seasons end a little earlier: 11.63 -> 11.43 weeks on average;
- home/away breaks 4,010 -> 3,255;
- 0 invalid schedules, and no league worse off.

A second set of 96 leagues, not looked at while building it, gave 34% fewer moves. The gain is smallest
when a third of a division is out on the same night (a school holiday). Then there's little to
rearrange. These are synthetic leagues. No real club's sign-up export has been run through it yet, and
that's the next check worth making.

It's on by default whenever the blackout box has dates. The page prints a "Blackout fit:" line saying
what changed. Full numbers: `eval/division-blackout-fit.txt` and the venture README.
