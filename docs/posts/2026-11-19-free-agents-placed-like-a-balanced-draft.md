---
title: "Free agents placed like a balanced draft: tag questions and a roster cap on a self-hosted league page"
seo_title: "Placing rec-league free agents on teams evenly, self-hosted"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product]
description: "The league page's /join free agents now go through the balanced-teams search: shortest rosters first, women and goalies spread, strength evened."
---

Every rec league has a free-agent list: people who want to play and have no team. The organiser
places them by feel, usually onto whichever team is shortest. That works until the shortest team
also happens to be the one that already has three goalies, or until the three women who signed
up alone all land on the same side of a coed league.

The [league schedule generator](../../ventures/league-schedule-generator/README.md)'s self-hosted
page has had a public `/join` page since earlier this month, with a suggested team for each player.
The suggestion was a simple rule: smallest roster first, ties to the team with the least free-agent
experience so far. Today it was replaced by the search the balanced-teams page uses for late
sign-ups, which already knew how to keep tags even and pin players who were told their team.

## What changed for an organiser

- **Tag questions.** In `/admin`, type `Woman=F, Goalie=G` (up to four). `/join` shows a checkbox
  for each, and the suggestion keeps each tag's count per team within one.
- **Roster cap as a hard rule.** "Roster size to fill teams up to" was already a setting; the search
  now treats it as a rule it cannot break, alongside friends kept together.
- **An optional ratings sheet.** Paste the CSV the balanced-teams page downloads, and players already
  on rosters count at their real rating and tags. A free agent's self-rated experience (1 to 3) is
  stretched onto the sheet's range.
- **No regressions by design.** The new picks are used only when they split every tag at least as
  evenly as the old rule and leave a gap between strongest and weakest team no larger. The admin
  page prints both gaps.

## What the measurement says

On 420 invented leagues (4 to 16 teams, rosters of 6 to 11, 3 to 30 free agents, about 40% ticking
"Woman" and 10% "Goalie"; `eval/free-agent-fit.txt`):

| Teams | Cases with a tag split unevenly, old rule | Same, now | Mean gap, old | Mean gap, now |
|---|---|---|---|---|
| 4 | 25 of 60 | 12 | 2.58 | 2.35 |
| 6 | 34 of 60 | 12 | 3.38 | 3.17 |
| 8 | 32 of 40 | 13 | 3.35 | 3.20 |
| 12 | 26 of 30 | 11 | 3.43 | 3.23 |
| 16 | 17 of 20 | 6 | 3.50 | 3.25 |

That table is without a ratings sheet, where rostered players count as 2 and carry no tags. With a
sheet, the mean gap fell from 21 to 31 points to 18 to 26 (ratings 1 to 10), and the tag excess
fell too, though most invented rosters were already uneven before any free agent arrived, and
nobody on a roster is ever moved. No case broke the roster cap or split a friend pair. The slowest
suggestion took 0.3 seconds, for 16 teams and 30 free agents.

## The limits

The ratings are what the organiser types, or what a player says about themselves. The size rule
and the tag rules weigh the same, so with a sheet the shortest roster ended a tenth of a player
smaller on average in some rows: the search traded a slightly shorter roster for an even split.
These are invented leagues; the next useful thing is a real league's free-agent list.

The code is MIT licensed and runs on the organiser's own server; nothing about the players leaves it
except the emails the organiser chooses to send.
