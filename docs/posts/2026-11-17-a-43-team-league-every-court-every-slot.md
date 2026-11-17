---
title: "A 43-team league with every court busy in every slot, and nobody waiting"
seo_title: "Wait-free schedule for a 43-team league on 7 courts"
date: 2026-11-17
tags: [ventures, league-schedule-generator, algorithms]
description: "43 teams on 7 courts and 9 time slots went from 1,073 waits to none. The search was the same one that stalled yesterday; it just got 2.7 hours."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can promise more than a fair round robin. With three games a night it tries to make
each team's games back to back, so nobody sits around between them. For odd leagues
that promise has been filled in one size at a time. Until today 43 teams on 7 courts
and 9 time slots was one of the gaps: over three test seasons the tool left **1,073
waits**.

Now it leaves **none**.

## Why 43 teams on 7 courts is hard

A night is three rounds. With 43 teams (one sits out each round) that is 3 × 21 = 63
games, and 7 courts × 9 slots is exactly 63 slots. Every court is busy in every slot.
For nobody to wait, every team that plays three games has to play them in slots
*r*, *r* + 1 and *r* + 2, and the same has to hold on all 15 nights of the season.
Change one game and the whole night has to be laid out again.

## The trick, and what it cost

The method is the one that already solved 19, 25, 31 and 37 teams
(`eval/odd-orbit.py`). Split 42 of the teams into three loops of 14 and turn each
loop one step a night. If one night takes exactly one pair from each family of pairs
that the turning cycles through, then turning that night 14 times gives 14 nights that
use every pair once. The leftover pairs make the last round. So a season of 15 nights
comes down to one question for a SAT solver: find one such night with a wait-free
layout.

That question has 166,511 variables. Yesterday it was stopped after 39 minutes with no
answer. Today it ran alone on a core and answered in **9,849 seconds**. That fits the
trend of the earlier sizes, each taking about four times longer than the last:

| Teams | Courts × slots | Solve time |
|---|---|---|
| 19 | 3 × 9 | 23 s |
| 25 | 4 × 9 | 141 s |
| 31 | 5 × 9 | 626 s |
| 37 | 6 × 9 | 2,783 s |
| 43 | 7 × 9 | 9,849 s |

Nothing was taken on trust. The season was checked as a whole before it was printed,
checked again match by match when it was stored, and the tool's tests check its rows
a third time.

## What's still open

At nine time slots on the fewest courts, every odd league from 11 to 45 teams now
gets a wait-free season. Two sizes are left below 50:

- **47 teams on 8 courts.** No turning trick works for this size (it is proved for the
  whole 3k + 2 family). The search re-deals two nights' games at a time until each night
  lays out. It reached 5 of 16 nights this session. The state is saved in the repository
  (`eval/lns-states/47-8x9.json`) so the next run picks up from there instead of
  starting over.
- **49 teams on 8 courts.** Fully booked, like 43. At four times longer per size, the
  same solver would need about 11 hours.

If you run a 43-team league on seven courts (a big darts, pool or cornhole league,
say), the generator now hands you a season where every team turns up, plays three in a
row and goes home. It's free and runs in your browser.
