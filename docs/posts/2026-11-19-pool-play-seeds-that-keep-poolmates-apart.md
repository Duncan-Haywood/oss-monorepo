---
title: "Pool play into a bracket without the rematch: crossover seeds, searched exactly"
seo_title: "Crossover seeding after pool play: no poolmate rematch in round one"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product]
description: "Pool play now seeds the knockout crossover-style. Seeding by record alone could put poolmates together in round one in 29 to 86% of random draws."
---

A weekend tournament usually runs in two parts: pools first, so every team gets a few games,
then a knockout bracket for the teams that advance. The [league schedule
generator](../../ventures/league-schedule-generator/README.md) has built the pool round robins
for a while. It also listed the play-off seeds: every pool winner first, best record first, then
every runner-up, and so on.

That list had a problem. Put it into a standard bracket (seed 1 plays the last seed, 2 plays the
second-last) and two teams from the same pool often meet in the first knockout game. Take two
pools of three with two advancing. If Pool B's winner has the best record and Pool B's runner-up
has the worst, the record order is `B1, A1, A2, B2`. That gives B1 v B2 in one semifinal, a
rematch of a game played that morning. Tournament organisers avoid it with a crossover: A1 v B2
and B1 v A2. The tool now does the same thing.

## What it does

Winners still come before runners-up, runners-up before thirds, and so on. Inside each place,
the new `poolPlayoffSeeds` picks the order so poolmates meet as late as the bracket allows. It
counts the number of poolmate pairs that could meet in round 1 and makes that as small as
possible, then does the same for round 2, and so on. Among the orders that tie, it keeps the one
closest to the record order, and moving a top seed costs more than moving a low one.

The pool card now shows which pool each seed came from. When the crossover changed the order it
adds a line saying so, with the possible poolmate meetings before and after. It also draws the
bracket itself, as single or double elimination with an optional third-place game, using the
play-off settings the page already had. Typing play-off results fills the bracket in.

## The first version found a worse answer

The first version swapped two teams within a place whenever the swap helped, and stopped when no
swap did. I checked it against a brute force that tries every possible order, on random pool
tables. Over 159 draws it lost twice. With 3 pools of 4 advancing and with 4 pools of 4, it got
stuck on an order with one poolmate pair that could meet in round 2, when an order with none
existed. No single swap leads from one to the other.

So now an exact search runs after the swaps. It places seeds one at a time and drops a partial
order as soon as its counts are already worse than the best full order found. The counts only
go up as more seeds are placed, so dropping it early never throws away a better answer. The
search stops at 300,000 steps and keeps the swap answer if it gets there. It matched the brute
force on all 530 random draws I ran, and it runs in the tests on five pool shapes. It takes
under a millisecond for most fields and about a fifth of a second for 8 pools of 4.

## How often record order went wrong

`eval/crossover-seeds.mjs` draws 500 random sets of pool tables for each common shape. Results
from [the file](../../ventures/league-schedule-generator/eval/crossover-seeds.txt):

| Pools x advancing | Record order: poolmates could meet in round 1 | Crossover |
|---|---|---|
| 2 x 2 | 245 of 500 | 0 |
| 2 x 4 | 383 of 500 | 0 |
| 3 x 2 | 161 of 500 | 0 |
| 4 x 2 | 287 of 500 | 0 |
| 4 x 4 | 428 of 500 | 0 |
| 6 x 2 | 145 of 500 | 0 |
| 8 x 2 | 314 of 500 | 0 |
| 8 x 4 | 430 of 500 | 0 |

With three or more pools the crossover also keeps poolmates apart through round 2 in every draw.
The record order allowed a meeting in round 1 or 2 in up to 499 of 500 draws. Two pools can't
manage that: each half of the bracket has to hold at least two teams from one pool, so they can
meet by round 2. The search proves that and settles for it.

## What it doesn't do

Places stay in order: a pool winner is always seeded above any runner-up, even when the pools
were uneven and one pool's runner-up had the better season. That is the usual rule, and an
organiser who wants something else can still type the seeds into the main play-off box by hand.
