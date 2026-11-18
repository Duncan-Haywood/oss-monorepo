---
title: "Doubleheaders without the wait: the gap was in the round robin, not the time slots"
seo_title: "Back-to-back doubleheader league schedules"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "Two games a night with no slot between them: waits fell from 458 to 10 across 18 league setups by changing which teams meet on the same night."
---

Many rec leagues play two games a night. Adult softball runs doubleheaders.
Volleyball, cornhole and darts nights often give each team two matches. The
[league schedule generator](https://marisstella.app/league-schedule-generator/)
now has a **Games per team per night** setting (2, 3 or 4). Two rounds of the
round robin share a night, so a team meets two different opponents.

The first version did the obvious thing and fell short. It took the usual
round-robin order, put two rounds on each night and searched for time slots.
With 8 teams on 2 diamonds and 4 start times, teams were still left sitting
out a slot between their games: **18 waits over three test seasons**. Changing
the slot search didn't fix it.

**Why the slots can't fix it.** Draw a night as a graph: teams are dots, and
each game is a line labelled with its round. A team plays back to back only if
its two games sit in neighbouring time slots. A group of teams joined by games
can do that when the whole group fits on its own pair of slots. With two games
a night, each group is a loop that alternates between the two rounds. In the
standard "circle method" order, two consecutive rounds join all 8 teams in one
loop of 8 games. Two diamonds hold 2 games a slot, so 4 per pair of slots. An
8-game loop does not fit, in any slot order.

**So the tool now changes the round robin instead.** It keeps every pair
meeting once but changes which pairs share a night, until each night splits
into loops small enough to fit (for 8 teams, two loops of 4). The move it uses
swaps two rounds' opponents around one loop, a standard trick in sports
scheduling that keeps every round a valid set of games. Then home and away are
set again. A simple count runs first. A team's games need consecutive slots,
and each slot holds two teams per court. So for some setups no order can work
at all. Ten teams on 4 courts and 3 start times is one: every team's pair of
slots includes the middle one, which holds only 8 teams. In that case the page
says how many courts back-to-back games would need.

**What it measured** (`eval/doubleheader.txt`, 60 league setups, 3 seeds each,
every season re-checked by the validator):

| League | Courts x times | Waits before | Waits now |
|---|---|---|---|
| 8 teams | 2 x 4 | 18 | 0 |
| 9 teams | 2 x 4 | 11 | 0 |
| 14 teams | 4 x 4 | 20 | 0 |
| 16 teams | 4 x 4 | 62 | 0 |
| 20 teams | 5 x 4 | 100 | 0 |
| 24 teams | 6 x 4 | 156 | 0 |
| 12 teams | 3 x 4 | 30 | 10 |

Across the 18 two-game setups where the count allows a wait-free night, waits
fell from 458 to 10, and 17 of the 18 now have none. The search takes 0.1 to
1.7 seconds.

**What it costs, and what is still open.** A wait-free night ties groups of
teams to the early pair or the late pair of slots. Early and late starts get
less even: at 20 teams the worst team's gap between its most and least used
start time grows from about 2 games a season to 5. The layout rotates the
groups week by week, but that doesn't close the gap. Three games a night
isn't improved yet. And 41 of the 60 setups can't be wait-free with the fewest
courts that fit the games, which the page now says plainly instead of leaving
organisers to wonder.

The code is MIT licensed: `nights.mjs` and the `gamesPerNight` path in
`calc.mjs`, in the
[repository](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
