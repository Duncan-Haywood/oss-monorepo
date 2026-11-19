---
title: "Bowling lanes: an even split, and never the same pair two weeks running"
seo_title: "Bowling league lane rotation without back-to-back pairs"
date: 2026-11-18
tags: [ventures, league-schedule-generator, algorithms]
description: "The free bowling schedule now cuts back-to-back weeks on one lane pair from 392 to 148 over 36 seasons, without making any team's lane split less even."
---

A bowling league secretary gets two kinds of complaint about lanes. One is "we keep getting the
pair by the wall". The other is "we were on 7-8 last week too". The
[bowling league schedule](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
already answered the first: on 36 measured seasons (6 to 24 teams, 26 to 34 weeks) every team bowls
every pair as evenly as the weeks allow. The second got worse as the first got better. The hardest
seasons to balance came from a SAT solver, and the solver didn't care about repeats.

## Why the old polish could not fix it

When the weeks divide evenly by the pairs (12 teams on 6 pairs over 30 weeks), every team must bowl
every pair exactly five times. The page's polish never lets a count leave that target. Its only move
is two matches in one week trading pairs, and that moves four teams' counts at once. So on those
seasons there was almost nothing it was allowed to do: 16 teams over 40 weeks ended with 58
repeats, 12 teams over 30 weeks with 13.

## Two changes

**An anneal that may leave the target for a while.** The page now makes the same swap but prices
it at 1 per count out of target plus 1 per back-to-back repeat. It accepts uphill moves with a
probability that falls to near zero over 600,000 steps. A season is kept only if every count is back
in target, so the result is never less even than what went in. Lane limits (a team that must never
bowl the end pair) stay hard throughout.

**Stored answers re-solved with repeats counted.** The SAT model that found the hard seasons now
has one extra variable per team, week and pair meaning "this pair this week and next". A counter
caps how many of them may be true, and the cap drops one at a time until the solver says no or
400 seconds run out.

## What changed

| | before | now |
|---|---|---|
| 36-season grid, repeats | 392 | 148 (13 seasons with none) |
| 38 stored or pinned seasons, repeats | 787 | 439 (8 with none) |
| seasons with every team at the even split | all | all |

A 12-team league over 30 weeks now bowls every pair exactly five times and never the same pair
twice in a row. So do 12 teams over 18 or 24 weeks and 10 teams over 30. For 6 teams over 30
weeks the solver proved 4 repeats is the least this round robin allows (the page had 23). The
extra pass costs 0.1 to 0.35 s a season in the browser.

Three solver answers were dropped: on those seasons the page's own search ended with fewer
repeats than the stored answer. Five seasons barely moved in 400 s (18 to 44 repeats left), and
those are the next item. The scripts and tables are in the project's `eval/bowling-repeat-sat.txt`
and `eval/bowling-repeat-anneal.txt`.
