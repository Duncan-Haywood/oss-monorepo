---
title: "Let the lower bound steer: the LP that proves a roster's cost also helps find a cheaper one"
seo_title: "Using an LP relaxation to guide staff schedule search"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, optimization, operations-research]
description: "Steering a staff schedule search with the LP behind its lower bound halved the remaining pay gap and filled open shifts on 3 of 9 test weeks."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) does two
jobs on a big week. It searches for a cheap roster, and it proves a lower
bound: no roster can cost less than this. The bound comes from a linear
program (LP), a relaxed version of the scheduling problem in which a person
can hold "0.4 of a shift". The gap between the roster and the bound tells
the manager how much better a schedule could possibly be.

On the 60-person test week, earlier runs had the roster at **$7.04 above the
bound** on a $19,119 pay bill. An outside integer solver (HiGHS) had shown
that a roster about $1 above the bound exists. So the gap was in the search,
not the bound. The cheaper roster differed by one big trade through 52 of
the 60 people on all five days. No piece of that trade helps alone, so moves
that change one day or two people at a time never get there.

**The idea.** The LP that proves the bound already points at that trade.
Its fractional solution says, pair by pair, how much each person "wants"
each shift. That LP is solved before the search's last pass anyway, so its
answer costs nothing extra.

**What did not work.** Pulling one day at a time toward the LP made things
worse: $8.82 to $11.41 above the bound instead of $7.04. The next exact
re-solve of that day simply undid the pull.

**What did work.** Sweep *every* day with a discount on each person-shift
equal to its LP value times a weight. Start the weight high (8× the average
wage) and halve it down to 0.12×. After each weight, sweep again on the true
cost and keep the result only if it is cheaper. The whole-week pull lasts
long enough for many people's weeks to shift at once.

| 60-person week | guide off | guide on |
|---|---|---|
| bench week, above the bound | $7.04 | **$3.46** |
| seed 3 week 1, above the bound | $11.45 | **$4.28** |
| seed 4 week 1, above the bound | $16.33 | **$7.21** |
| seed 1 week 1, open hours | 232 | **227** |
| seed 1 week 0, open hours | 210 | **208** |
| seed 4 week 0, open hours | 216 | **214** |

On the 8 weeks where it ran, it was never worse, and run time stayed within
a second. The open-hours rows matter most: those are shifts nobody was on,
and the guided pass filled them where the plain search could not. The
generated weeks are short-staffed on purpose, so most of their open hours
can't be filled by anyone.

**The limits.** These are single runs on one cloud machine and nine
generated weeks. On eight of them the LPs were forced on, because under the
default 20-second budget they don't fit on those weeks. HiGHS's roster is
still $2.32 cheaper than what the engine posts on the bench week. The next
step is to run the LP by default when the budget allows, now that it does
more than prove a bound.

Numbers, method and the dropped variants are in the venture README,
"Steering the day sweeps with the pay floor's LP", and
`eval/day-guide.out.txt`.
