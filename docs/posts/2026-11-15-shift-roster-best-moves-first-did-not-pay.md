---
title: "Best moves first didn't pay, and a profile that says why"
seo_title: "Move ordering in a shift scheduler: a measured negative result"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research, profiling]
description: "Trying the most promising moves first in a shift scheduler's search: faster on one week, slower on another, worse on a third. A profile shows why."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an
opt-in price for pairs of call-outs that can each be covered alone but not
together. The search behind it is a first-improvement hill climb: it takes
the first move that pays for itself and starts again. Earlier today a time
cap landed on that search. It showed that on the bigger weeks the moves
worth having came late, so a 10-second cap kept a fifth of the gain or none.

The obvious next step was to try the promising moves first. Every candidate
already goes through cheap tests (pay and fairness, and the single call-out
risk) before the expensive pair search. Those tests say how much room a
move has left for clashing pairs. So: screen every candidate in a round,
then run the pair searches largest room first.

It is in the tool now as `--second-callout-rank`, and it is off. On three
seeded weeks (uncapped, $25 an hour at risk, $1 a pair hour):

| week | first-improvement | largest room first |
|---|---|---|
| 20 people, 75 shifts | 4 moves, 1.5 s, $1,315 gained | 1 move, 0.7 s, **$1,121** |
| 40 people, 149 shifts | 11 moves, **16.0 s** | the same end in 28.3 s |
| 30 people, 121 shifts | 6 moves, 202 s | the same end in **160 s** |

Two things went wrong. First, room is not gain. Room is measured before the
pair hours come off a move, so the move with the most room is not the one
that helps most. On the 20-person week it led straight into a worse local
optimum. Second, screening every candidate every round costs something:
2.8 times as many candidates on the 40-person week. Even where the rank
helped, on the 30-person week, the first move still came 42 seconds in.

## Where the time goes

So I profiled the plain search on the 40-person week. 11.2 of its 15.7
seconds are spent in one small function, `validWith`, which asks whether a
person can take one more shift. It is already tight: typed arrays, no
allocation, lists of four or five shifts. The cost is how often it runs.
Grouped by the check that calls it:

- 5.9 s: 1,379 cheap pair searches that ended by refusing the move;
- 2.8 s: 1,514 single call-out screens;
- 1.9 s: 83 full pair searches that refused the move;
- 1.9 s: 116 unbudgeted single call-out checks;
- 2.3 s: the 129 pair searches that ran to the end.

The biggest line is refusals, at about 4 ms each. The starting roster has
314 clashing pairs under the cheap search's budget, 308 of them only because
the search gave up. A refusal has to count nearly all of their hours before
it knows the move cannot pay, and each given-up pair costs the full budget.
That is the next thing to attack.

## One more idea that didn't work

If the cover for one call-out and the cover for another change no one in
common, both can be applied at once, since every rule is checked one person
at a time. Such a pair needs no joint search. That is exact. It also applied
to almost nothing: 0 of 703 pairs on the 40-person week. The search hands
every cover to the same first person with slack, so almost any two covers
meet. And the pairs it would skip were the cheap ones anyway.

Measured on invented teams and seeded weeks, single runs on one machine.
Details and the full tables are in the tool's README under "The pair
price's best moves first, and where its time goes", with
`eval/pair-rank.mjs` to rerun them.
