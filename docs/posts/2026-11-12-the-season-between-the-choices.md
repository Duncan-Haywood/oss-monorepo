---
title: "The season between the choices: letting a league organiser pick from the whole frontier"
seo_title: "Carry-over vs back-to-back games: pick any season on the frontier"
date: 2026-11-12
tags: [league-schedule-generator, ventures, scheduling]
description: "The league scheduler's four fixed choices skipped stretches of the carry-over / back-to-back trade. Now every frontier season is a button."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has to trade off two things in a home-and-away season.

- **Carry-over.** Suppose your team always plays the team that just faced the strongest side. Then you keep meeting tired opponents, and someone else keeps meeting fresh ones. Lower carry-over spreads that luck more evenly.
- **Back-to-back home or away games** ("breaks"). Two away trips in a row are what captains complain about.

You can't have the least of both. The page runs ten searches and offers four choices along the trade: most even, balanced, fewer back-to-back, and fewest possible.

## The gap

Here are the ten searches for a 19-team home-and-away season, as the page reported them this morning (carry-over / breaks):

> 1311/87 ×7, 1517/84, 5741/48, 3731/59

Below 84 breaks, the next season is 59 breaks at almost three times the carry-over. An organiser who wanted "about 70 back-to-backs" could not get one. Whichever choice they picked, they got 87, 84, 59 or 48.

## Two changes

**Every season on the frontier is now a button.** A season is on the frontier when no other search has both less carry-over and fewer breaks. After a search, the page lists those seasons under the report. Click one and the schedule uses it. The share link carries the pick, tied to the team count, single or double and seed, so it can't be applied to a different league by accident.

**Two more searches aim at the gap.** These are capped searches whose cap sits between the existing capped searches and the weighted ones. The four choices still choose among the original ten only, so every share link made before today still builds the same season. No version number was needed.

At 19 teams the frontier now includes **3,203 / 72**, between 84 and 59. Across our runs (`eval/frontier-gap.txt` in the repository):

| League | A new season joins the frontier | Widest gap in breaks, before → after |
|---|---|---|
| 17-20 teams, home and away | 9 of 12 runs | 19 teams 25 → 13; 18 teams 18 → 10 |
| 15-20 teams, single round robin | 10 of 10 runs | 17 teams 14 → 6 |

On a four-core phone or laptop the wait doesn't change. Ten or twelve searches over four threads both come to a queue of three.

## What didn't work

First we tried a "squeeze": start the low-break search from the best low-carry-over season and lower the break cap step by step. It never got below the starting season's breaks. Moves that keep the timetable can't reduce breaks, and flipping a single venue upsets the home/away balance. Heavier break weights in the ordinary search didn't help either, because they kept finding the same starter season. That is why the gap tries cap the search from the circle method instead, and why a stretch between about 66 and 90 breaks at 20 teams is still thin. That search is the next job.

The code is MIT licensed and runs in your browser. Nothing you type is uploaded. The schedule is a planning aid: check every date before you send it to teams.
