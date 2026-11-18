---
title: "Half the back-to-back home games in an odd home-and-away league"
seo_title: "Home and away schedule for an odd number of teams: fewer breaks"
date: 2026-11-11
tags: [scheduling, sports, round-robin, algorithms, open-source]
description: "The free league scheduler now builds home-and-away seasons for odd leagues with about half the back-to-back home or away games: 25 teams, 262 down to 117."
---

When a team plays at home twice in a row, or away twice in a row, schedulers
call it a *break*. Fans notice it, and so does travel. The free
[league schedule generator](../../ventures/league-schedule-generator/) tries to keep
breaks low while also keeping *carry-over* even: how often a team meets the
same opponent straight after the same other team, which decides whether
everyone gets a fair run of fixtures.

Earlier today the single round robin search learned a trick. Each built-in
starter timetable has a closed-form home/away pattern, where every pair keeps
its host as the rounds shift. For leagues with a bye (an odd number of teams)
that pattern has about half the breaks the general venue search found.

The home-and-away season (each pair meets twice, once at each ground) didn't
use it. Its first leg always came from a searched start, so a 25-team season
still had 262 breaks.

## The change

Each starter with its shift home/away is now a candidate first leg for the
season too. The second leg is built the usual way: start from the first leg
played backwards and search it with the breaks counted exactly, or simply
mirror the first leg with grounds swapped. A candidate is kept only if it
scores strictly better than every existing start, so no size gets worse.

## Results

Seed 1, a break costing 10 carry-over points (carry-over / breaks):

| Teams | Before | Now |
|---|---|---|
| 11 | 487 / 31 | 497 / 23 |
| 17 | 1,333 / 87 | 1,285 / 65 |
| 19 | 1,525 / 119 | 1,311 / 87 |
| 23 | 2,381 / 211 | 2,189 / 109 |
| 25 | 2,889 / 262 | 2,685 / 117 |
| 29 | 3,885 / 370 | 3,951 / 165 |

At 17, 19, 23 and 25 teams both numbers drop, because the old first legs were
worse on both counts. At 26 teams (no bye) nothing changed. Every season was
checked: each pair meets once per leg, at different grounds, and every team
has the same number of home games.

## What it doesn't show

It's one seed and one weight. The page runs several tries at weights 10 to 80
and picks one, and those picks haven't been re-measured yet. The search also
takes longer at sizes with built-in starters, because each candidate gets its
own second-leg search.

Code, measurements and the full table: the venture's README, "Shift venues for
a home-and-away season", and `eval/shift-double.txt`. MIT licensed, runs in
your browser.
