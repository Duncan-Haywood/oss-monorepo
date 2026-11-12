---
title: "Ten searches, four results: re-measuring the league scheduler's carry-over choices"
seo_title: "Round-robin carry-over vs home/away breaks: four choices measured"
date: 2026-11-12
tags: [league-schedule-generator, ventures, scheduling]
description: "The league scheduler's four carry-over choices measured on its own ten searches against 20 real top-flight seasons, and why 19 teams got one season 7 times."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has a box called "Spread who you meet next". Tick it and the page runs ten searches for a home-and-away season with an even *carry-over*. Carry-over counts how often a team plays someone straight after that someone played the same strong side. The page then keeps one of the ten, chosen by what you said you care about: the most even carry-over, a balance, fewer back-to-back home or away games ("breaks"), or the fewest breaks possible.

The last time those choices were measured, the page ran four searches and offered three choices. Since then a lot has landed underneath: starter timetables, a finite-field start, capped-break searches, zero-break odd leagues, shift venues. So today's run measured the page as it ships now. It ran the same ten tries the page runs and applied each choice with the same function the page calls. Then it recounted carry-over and breaks from the kept rounds and set the 18- and 20-team results against 20 real top-flight seasons (Bundesliga, Ligue 1, Premier League, La Liga, Serie A, 2021-22 to 2024-25).

## What each choice keeps

Means over five seeds, carry-over / breaks over a whole home-and-away season:

| Teams | Most even | Balanced | Fewer back-to-back | Fewest | Real seasons |
|---|---|---|---|---|---|
| 18 | 1,355 / 93 | 1,467 / 78 | 1,803 / 59 | 2,493 / 48 | 1,840-4,342 / 48-96 |
| 20 | 1,460 / 117 | 1,460 / 116 | 2,102 / 86 | 5,039 / 54 | 2,278-2,564 / 70-146 |

Every "most even" season has less carry-over than every real season of its size. "Fewest" at 18 teams matches the Bundesliga's 48 breaks at well under its carry-over (2,398 to 2,638 against 3,474 to 4,342), so it beats 4 of the 6 real 18-team seasons on both counts. At 20 teams "fewest" gets 54 breaks, fewer than any of the 14 real seasons (70 and up). But it pays for that with about twice their carry-over, so it beats none of them on both counts. If you run a 20-team league, "fewer back-to-back" is the sweet spot: 1,872 to 2,396 carry-over with 72 to 96 breaks, and it beats 5 to 8 of the 14 real seasons on both counts.

On the same code, ten tries beat the old four. At 18 teams "fewer back-to-back" went from 1,638/68, 1,918/60 and 1,890/60 to 1,662/58, 1,800/60 and 1,784/60 on the same three seeds.

## Seven searches, one season

The surprise was at 19 teams. Seven of the eight weighted searches came back with exactly the same season, 1,311 carry-over and 87 breaks, whatever break weight they were given. At 20 teams three of the eight landed on the 1,460 floor. The starter timetable at those sizes is so good that the search starts there and stays there. So "best of ten" at 19 teams is really best of four, and the page's read-out listed `1311/87` seven times in a row.

The read-out now says what happened: "Best of 10 searches for an even carry-over, 4 different results (... 1311/87 ×7, 1517/84, 5741/48, 3731/59 ...)". Which season gets kept did not change, so no share link builds a different schedule.

## What is still open

At 17 to 20 teams there is a cliff between the last two choices. At 19 teams "fewer back-to-back" keeps 83 breaks and "fewest" keeps 48 at nearly four times the carry-over, with only one try (3,731 / 59) in between. The duplicate searches are the obvious budget for filling that gap with capped searches at caps in between. But changing what a try does changes the season a share link rebuilds, so it needs a versioned link first.

These are search figures on made-up team names. No league organiser has scheduled a season with it yet. The full tables, every seed and every try are in the venture's `eval/best-of-k-page.txt`, and `node eval/best-of-k.mjs --page` reproduces them.
