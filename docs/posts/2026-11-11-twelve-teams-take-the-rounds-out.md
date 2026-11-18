---
title: "Twelve teams: taking rounds out and putting them back"
seo_title: "Round robin carry-over for 12 teams: a refill search beats starters"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms]
description: "Every earlier search stopped at 152 for a 12-team round robin. Taking a few rounds out and refilling them by exhaustive search reached 136."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) can spread out
*who you meet next*: if one team is the strongest, you don't want the same opponent to keep
meeting it in the round before. Russell's carry-over value measures this. Count how often each
team is followed by each other team in someone's fixtures, square the counts and add them up.
Lower is fairer. For 12 teams the floor is 120, which is every count 0 or 1.

Earlier today the tool sat at 152 for 12 teams. Random sampling of "starter" timetables (each round
a shift of the first) could not go lower, and neither could two climbing searches over starters or
an annealing search over round swaps. At 20 and 22 teams starters reach the floor. At 12 they don't
get close.

## The move

A new search, `eval/round-refill.mjs`, looks at every round robin rather than only starters. It
takes 2 to 5 rounds out of the season. The games in those rounds form a small regular graph. It then
tries every way of splitting that graph back into rounds, in every order, and keeps the split with
the least carry-over.

The search places one game at a time. Each game creates up to four carry-over cells: team *a*
meeting *b* means *a*'s last opponent is followed by *b*, and *b* is followed by *a*'s next one. A
cell that already holds a count costs extra, so a branch that is already worse than the best split
found is cut at once. A few times in a hundred moves the search takes a random split within a few
units instead, to get off a plateau.

## What it found

| 12 teams | Before | Now | Floor |
|---|---|---|---|
| Single round robin, carry-over only | 152 | **136** | 120 |
| Home-and-away season, carry-over only | 538 | **530** | 492 |

Three of four 7-minute runs reached 136. At 136 every count is 0, 1 or 2, and eight cells hold 2.
For 9 teams (with a bye) the value went from 71 to 69. The timetables are stored in the code, so the
page starts from them and needs no long search. When a league also asks for few home/away breaks,
the search now gives up some of the new carry-over for 4 fewer breaks: 180 with 14 breaks, where
it gave 152 with 18.

What it didn't do: 11 teams tied the old 115, and 14 teams did worse than the starter (220 against
212). Bigger leagues have far more ways to refill each window, so the search needs a better start
or more time there. Whether 136 is the least possible for 12 teams is still open.

The code, the run logs and the tests are in
[`ventures/league-schedule-generator`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator),
MIT licensed.
