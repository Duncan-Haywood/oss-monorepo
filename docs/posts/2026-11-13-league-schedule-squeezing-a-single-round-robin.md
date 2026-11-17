---
title: "Filling the gaps when everyone plays everyone once"
seo_title: "Single round robin: carry-over vs back-to-back games, the gaps"
date: 2026-11-13
tags: [league-schedule-generator, ventures, scheduling, optimisation]
description: "The scheduler's capped squeeze now runs on single round robins: 42 new seasons over 24 runs, up to 22% less carry-over at a budget, one idea no better."
---

Earlier today the [league schedule generator](https://marisstella.app/league-schedule-generator/) learned to *squeeze* a home-and-away season. A squeeze searches the fixture order and the grounds together under a cap on back-to-back home or away games ("breaks"), and fills the holes in the list of seasons an organiser can pick from. A single round robin, where everyone meets once, didn't get squeezes. Its list had holes too.

At 19 teams, every seed's searches went from 323 carry-over at 36 breaks straight to between 959 and 1,079 at 24 to 28 breaks. Carry-over measures how often a team meets the same opponent right after the same other team. So an organiser willing to accept a few more back-to-back games than 24 had nothing between "very fair" and "three times less fair".

## What changed

The single round robin now runs the same search on one leg (`squeezeSingleRounds`). The home-and-away version and this one share their code. Every match keeps its ground while fixtures move. Three moves change grounds: flip one match, flip two of a team's matches (one home, one away), or flip a whole run where the team alternates home and away. A move is refused if it leaves any team's home and away games more than one apart. The page runs four squeezes after its twelve searches, about a second more. The squeezed seasons join the list, and the four preset choices and every older share link stay as they were.

## What it adds

Over 24 runs (10 to 20 teams, three seeds each, `eval/squeeze-single.txt`):

- 42 squeezed seasons join the list, and 9 seasons the searches had found are now beaten on both counts.
- At 19 teams, seed 1, the list goes 323/36, then **897/32, 955/30, 1,019/26**, then 1,079/24. The 12-break hole is now 4 breaks wide.
- Take the least carry-over available within each break budget. It falls 1.5% on average: 3.9% at 17 and 19 teams, 0.7% at the even sizes. The best single budget improved by 21.9% (17 teams, 16 breaks: 975 down to 761).

A headless-browser run of the page at 19 teams listed exactly the seasons the measurement script found, picked 897/32, and its share link reopened on it.

## What it doesn't do

The biggest hole at 20 teams is still there: 360 carry-over at 52 breaks, then nothing until about 546 at 36. Squeezing up from 546/36 with room for 44 breaks found nothing better. Walking down from 360/52 two breaks at a time never got under 50. That 360 season comes from a hand-searched starter timetable in which every carry-over count is 0 or 1. Its fairness is tied to its pattern of home and away games, and small moves break the pattern. The 19-team home-and-away jump has the same shape, so the next attempt is a move that keeps the starter's structure, not another local move.

## An idea that didn't help

In an odd-sized league each team plays an even number of games, so "balanced" means exactly half at home. Every ground move that touches a team only once is then refused. Reversing a three-team cycle of hosts (A hosts B, B hosts C, C hosts A) keeps every count, so it looked like the missing move. Measured on the same 24 runs it cut 1.4% on average against 1.5% without it. On the 19-team home-and-away jump it found nothing new either. It stays in the code behind an option, off. The odd sizes improve anyway, because moving fixtures changes which games sit next to each other, and that moves breaks without touching a ground.

The scheduler is free and runs in the browser. Turn on "Spread who you meet next" to see the list.
