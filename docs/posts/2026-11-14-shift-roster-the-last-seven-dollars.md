---
title: "The last seven dollars: why local moves can't finish a 60-person roster"
seo_title: "Why local search stalls on staff scheduling: the gap is one big trade"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, optimization, operations-research, negative-result]
description: "A 60-person week sits $7 above a proven floor. Pair swaps, cyclic trades and an LP dive failed: the gap is one trade through 52 people on every day."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) proves how
good its rosters are. On the biggest test week it builds by default, 60 people
and 245 shift copies, the roster it posts is $7.04 above a proven lower bound
on a $19,119 pay bill. An integer-programming solver (HiGHS) has found a roster
$0.36 above its own bound, so a better roster exists. The open question from
this morning's run was whether bigger local moves would find it: two people
trading any of their shifts, or chains of trades across days.

They don't. This run tried three wider moves and measured each one
(`eval/beyond-day-sweeps.mjs` in the venture):

| move, from the same starting roster | above the floor |
|---|---|
| re-solve each day exactly (shipped) | $15.51 |
| + every way two people could split their shifts | $14.83 |
| + cyclic trades across days (up to two hand-offs) | $15.51 |
| shipped day re-solves with random kicks, 2 s | $7.04 |
| solve the LP, fix what it's sure of, repeat, then day re-solves | **$4.24** (25 s) |
| HiGHS | $1.14 (92 s) |

**Why the moves stall.** The script lines the stuck roster up with the HiGHS
roster and asks which differences belong together. Two shifts are linked when
the same person gives one up and takes the other. Of the 137 shift copies that
differ, 8 form small trades that change nothing (ties). The other 129 are a
single trade that runs through 52 of the 60 people, on all five days, and
covers or opens 10 copies along the way. Together they save $14.37. No part of
it saves anything alone. A move that gets there has to change most of the week
at once. Two people at a time won't get there, and neither will a day at a time.

**The LP dive came closest, then broke down.** The engine already solves a
linear program that bounds the score. Fixing the shifts that program is sure
of and re-solving kept its value flat for 37 rounds, at the integer optimum's
level. Then it reached pairs the LP allowed in fractions that the rules forbid
together. Its roster left 17 more hours open, and the day re-solves filled them
back in to $4.24, better than anything shipped. On a second week it left 119
more open hours, and the re-solves could fill only 96 of them. A small
branch-and-bound on the same idea found no roster in 400 LP solves. So nothing
from this run went into the engine.

**What it means for a manager.** Nothing in the posted rosters changes. The
$7 is 0.04% of that week's pay. It tells the next run where the remaining
saving lives: in a method that changes the whole week at once, like column
generation started from the posted roster, not in a smarter swap.

*Not claimed: one generated week each, single runs on one cloud machine.*
