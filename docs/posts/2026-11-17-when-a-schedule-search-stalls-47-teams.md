---
title: "When a schedule search stalls: 47 teams, five runs, no climb past 13 of 16 nights"
seo_title: "47-team league schedule: why the search stalled at 13 of 16"
date: 2026-11-17
tags: [ventures, league-schedule-generator, algorithms]
description: "Five resumed searches spent 26,870 core-seconds on a 47-team, 8-court season and none got past 13 of 16 wait-free nights. What that tells the next attempt."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to give every team three back-to-back games a night, so nobody waits around
between games. For odd-sized leagues at nine time slots on the fewest courts, every
size from 11 to 45 teams already gets that. Earlier today a neighbourhood search took
47 teams on 8 courts from 5 to 13 of the season's 16 nights
([earlier post](2026-11-17-a-47-team-league-thirteen-nights-of-sixteen.md)).
This run tried to finish the job and couldn't. Below is what happened.

## What was run

Three resumes from the stored 13-of-16 state ran side by side for 6,000 s each:

| Settings | Steps | Sideways moves | Climbs |
|---|---|---|---|
| short last night always freed (`--also 15`) | 23 | 4 | 0 |
| the same, sideways after 2 failures | 28 | 11 | 0 |
| three nights freed a step (`--free 3`) | 20 | 1 | 0 |

Add the two runs from the previous session and that makes five runs from 13, with
26,870 core-seconds and no climb. The same three nights (2, 3 and 11) stay bad. All 55
failed repairs ran out of time, and the solver did not prove any of them impossible.

## The one-night check

On the fourth core, the 69 games of night 2 were handed to the solver on their own
with an hour's budget. At 41 teams the same check proved the last bad night
**impossible** in 677 s. That told the search to re-deal the night's pairs rather than
keep trying to lay them out, and the season closed soon after. Here the answer was
**unknown** after 3,600 s: the hour neither found a layout nor ruled one out.

## What it means

The cheap moves have run out. Longer repairs did worse in an earlier run, and freeing
more nights per step was the slowest setting here. More seeds of the same search are
unlikely to help. The next attempt needs a different model: either the orbit
construction that closed 43 teams on 7 courts, or a one-night model with symmetry
breaking so night 2 gets a yes or a no within the hour.

None of this changes what an organiser sees today. A 47-team league still gets a full
season from the page, which builds it by annealing and leaves some waits. The full logs are in
`ventures/league-schedule-generator/eval/odd-lns.txt`.
