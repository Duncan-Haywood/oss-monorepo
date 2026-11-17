---
title: "Picking a round-robin timetable for its home/away pattern, not just its carry-over"
seo_title: "Round robin carry-over vs home/away breaks: picking the starter"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, round-robin]
description: "A 26-team league can keep the same carry-over with 74 back-to-back home or away games instead of 102, by choosing a different starter timetable."
---

The league schedule generator builds round robins that score well on two
counts. **Carry-over** is about who you play just after whom: if team B
plays the strongest side and then C, C keeps meeting an opponent straight
out of a hard game. **Breaks** are two home games in a row, or two away. The
search minimises carry-over plus a price for each break (10 for the page's "balanced" pick).

Since this morning most even league sizes from 6 to 40 start the search from a
*starter* timetable: a pairing of the numbers 1 to N - 2 that, shifted one
step a round, gives a full round robin. The built-in starters were chosen on
carry-over alone. The note we left said: pick the starting round on carry-over
plus breaks when a break price is set.

## The start was never the lever

That turned out to be a non-question. Starting a starter timetable at round t
gives the same timetable as starting at round 0 with every team renamed
u - t. Carry-over, and every home/away pattern a search can find, are
unchanged by renaming. We checked it on every built-in entry: the count is
identical at every start. Rewriting the start picker changed no result at 12,
20 or 24 teams.

What can change is **which starter** you use.

## A second table

We reran the fast starter climb from earlier today, but kept a wide pool of
starters near the best carry-over, 250 a size, and scored each one again on
carry-over plus 10 times the breaks from the full home/away search. At 26
teams the carry-over-first starter had 716 carry-over and 104 breaks. One in the
pool has the same 716 with **74**. At 30 teams, 948 / 138 became 1,164 / 86.

Those starters now sit in a second table. When a break price is set, the
search runs a third time, from that table, and keeps the result only if it
scores strictly lower. So no size can get worse.

## What a league gets

Through the full search, seed 1, break price 10 (carry-over / breaks):

| Teams | Single round robin | Home-and-away season |
|---|---|---|
| 12 | 180 / 14 → 170 / 14 | 618 / 42 → 602 / 40 |
| 18 | 456 / 30 → 348 / 40 | 1,556 / 76 → 1,316 / 98 |
| 26 | 716 / 102 → **716 / 74** | 2,618 / 230 → **2,714 / 164** |
| 28 | 828 / 114 → 978 / 76 | 3,148 / 246 → 3,564 / 178 |
| 30 | 948 / 136 → 1,164 / 92 | 3,624 / 288 → 3,950 / 194 |

A 26-team home-and-away season loses 66 of its 230 back-to-back home or away
games for about 4% more carry-over. At 9, 13, 17, 19, 21, 22, 23, 27 and 29
teams nothing changed, so the table only holds the sizes that gained. Odd
leagues rarely gain because their circle-method start already gets a
home/away with no breaks at all.

The cost is the third search: a 26-team season at break price 10 went from
6.3 s to 9.6 s in Node. The page runs its eight weighted tries on a pool of
Web Workers, so on a four-core laptop that is a few extra seconds. Sizes
without an entry, carry-over-only searches and the capped tries are unchanged.

## What is still open

36, 38 and 40 teams have entries but have not been run through the full search
yet. The pool is rescored after the climb because the home/away search is
slow (30 to 160 s a size for 250 starters). A climb that prices breaks inside
each move would try far more. The method and every number are in the venture's
README, "Starters picked with their breaks", and the scripts are
`eval/starter-breaks.mjs` and `eval/starter-breaks-search.mjs`.

The schedule generator is free and MIT licensed. It is a scheduling tool, not
professional advice. Check any fixture list against your league's rules.
