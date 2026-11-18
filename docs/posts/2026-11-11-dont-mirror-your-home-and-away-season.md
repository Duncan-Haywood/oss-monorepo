---
title: "Don't mirror your home-and-away season"
seo_title: "Double round robin schedules: why mirroring doubles carry-over"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, open-data]
description: "Replaying the first half with venues swapped doubles every carry-over count. Searching the second half on its own takes 20 teams from 2,136 to 1,678."
---

Earlier today the [league schedule generator](https://marisstella.app/league-schedule-generator/)
learned to even out the **carry-over effect**: how often teams meet the same
opponent straight after that opponent has played the same other side
([the first post](./2026-11-11-who-you-play-after-the-champions.md)). For a
home-and-away season it did what most people do by hand: write the first half,
then play it again with the venues swapped.

That shortcut has a cost. Every "A, then C" step in the first half happens again
in the second, so every carry-over count doubles, and Russell's carry-over value
(the sum of the squared counts) roughly quadruples for that half.

## What changed

Ticking "Spread who you meet next" on a double round robin now searches the
second half as a round robin of its own. It starts from the first half played
**backwards**, which turns every "A, then C" into "C, then A", so the counts
spread out instead of doubling, and each team's home/away pattern is its
first-half pattern reversed and flipped. Then a seeded search swaps rounds and
partial rounds inside the second half, scoring carry-over plus the exact number
of back-to-back home or away games. The rules every league expects still hold:
each pair meets once in each half, the return game is at the other ground (so
everyone has the same number of home games), and nobody meets the same team or
sits out twice running across the halfway point.

## The numbers

Seed 1, on the same comparison as the first post (published fixture lists from
openfootball, CC0, 2021-22 to 2024-25):

| Schedule | Teams | Carry-over | Home/away breaks |
|---|---|---|---|
| Premier League, La Liga, Serie A, Ligue 1 (14 seasons) | 20 | 2,278 to 2,564 | 70 to 146 |
| Tool, first half mirrored | 20 | 2,136 | 114 |
| Tool, whole season searched | 20 | **1,678** | 124 |
| Bundesliga (4 seasons) | 18 | 3,474 to 4,342 | 48 |
| Tool, first half mirrored | 18 | 1,926 | 74 |
| Tool, whole season searched | 18 | **1,498** | 88 |

The least possible value for 20 teams is 1,460, so the search gets within 15%
of the floor. It pays about ten more back-to-back home or away games for that,
still inside what the professional leagues play. Those leagues also have
derbies, police requests and television slots to fit, which the tool does not.

The code (`carryover.mjs`, `lowCarryOverDoubleRounds`) and the comparison
(`eval/carryover-real.mjs`) are MIT licensed in the repository. Breaks are the
next thing to work on: the search only moves the second half when it counts
them, and moving both might get the extra ten back.

*Estimates from code and public data; no warranty.*
