---
title: "When five bowling teams avoid the same lane pair, change who plays whom in week one"
seo_title: "Bowling schedule with many teams avoiding a lane pair"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "The free bowling schedule maker refused some seasons with five or more lane limits that a different round-robin order can play. It now finds that order."
---

The [bowling league schedule
page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html) lets a league
mark teams that must never bowl on a pair of lanes: the end pair by the wall, the pair by the bar.
With up to four such teams it fits answers a SAT solver found ahead of time. With five or more it
searched on the usual order of the round robin, and sometimes said a week was impossible when it
was not.

## The case that broke

Ten teams, five lane pairs, and five teams who cannot use the last pair. Every week the last pair
needs a match between two of the five other teams. In the usual order, week one puts each of the
five limited teams in a different match, so no match is left for the last pair. The page refused
the whole season and told the organiser to loosen a limit.

But the five unlimited teams meet each other ten times in a nine-week cycle. That is enough for
one such match every week, if the teams sit in the right places of the rotation. The round robin
does not care which team gets which place: everyone still meets everyone as often.

## What changed

Before searching lanes, the page now checks each week the season plays: can every match get a
pair its teams may use? That is a small matching problem per week. If any week is short, it swaps
limited teams to other places in the rotation and keeps swaps that do not make things worse, with
a fixed work budget so the same input always gives the same schedule. A season that already
worked is left exactly as it was.

## Measured

On 112 seasons (10 to 24 teams, 26 to 34 weeks, four kinds of limit with five to eight limited
teams), the page used to build 100 and refuse 12. It now builds 104 and refuses 8, with no limit
ever broken. The 8 it still refuses cannot be played in any order: with six of ten or twelve teams
off both end pairs, the others do not meet often enough to fill both end pairs every week. On the
older 142-season grid with at most three limited teams nothing changed.

The re-dealt seasons are not perfectly even yet: 8 or 9 of 10 teams get their fair share of each
pair. Picking the most even order, not the first legal one, is the next step. Method and numbers:
`ventures/league-schedule-generator/README.md`, "Five or more limited teams", and
`eval/bowling-many-limits.txt`.
