---
title: "Home-and-away seasons for 11 and 13 teams: less carry-over and fewer back-to-back games"
seo_title: "Double round robin, 11 or 13 teams: less carry-over, fewer breaks"
date: 2026-11-12
tags: [league-schedule-generator, ventures, scheduling]
description: "Home-and-away seasons for 11 and 13 teams now start from a capped shift starter: lower carry-over and fewer breaks. A 15/31-team idea changed nothing."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) can build a home-and-away season (a double round robin) that does two things. It spreads out *carry-over*: if you play the strongest team, you don't want to keep meeting the same side the week after. It also keeps *breaks* down. A break is two home games in a row, or two away games in a row. The search scores a season as carry-over + 10 × breaks and keeps the lowest.

Earlier today the single round robin gained "capped shift candidates". The search takes a built-in starter timetable whose home/away pattern rotates with the rounds, then lowers its carry-over without letting its breaks go up. The home-and-away search didn't use these yet. Now it does: each capped candidate can be leg one, and leg two is searched against it as usual.

## What changed

We ran every size from 9 to 40 teams on two seeds. Each season was checked as valid, and every number was recounted from the rounds:

| Teams | Seed | Before (carry-over / breaks) | Now | Score |
|---|---|---|---|---|
| 11 | 1 | 497 / 23 | 481 / 22 | 727 → 701 |
| 11 | 2 | 509 / 21 | 505 / 19 | 719 → 695 |
| 13 | 1 | 733 / 35 | 721 / 32 | 1,083 → 1,041 |
| 13 | 2 | 739 / 32 | 721 / 29 | 1,059 → 1,011 |

In all four rows both numbers went down, so nothing was traded away. At every other size the score did not change, and the extra searches added 30 to 40% to the run time. So the shipped default only tries capped leg ones up to 16 teams. From 17 teams up the search runs exactly as fast as before.

## What didn't work

Leagues of 15 and 31 teams are "field sizes": with a bye they make 16 and 32, powers of two, where the scheduler starts from a perfectly balanced field timetable. We tried the 16- and 32-team shift starters as leg ones there. Nothing changed on either seed, and the run took twice as long. Two things explain it. Leg one of a field-size season already comes from the single search, which picks the 31-team shift starter when it wins. And a perfectly balanced leg one, played again with grounds swapped, is very hard to beat. The option stays in the code as `fieldShift` and is off.

The method, the full table and the script are in the venture's README ("Shift candidates in a home-and-away season, part two") and `eval/shift-double-capped.mjs`.
