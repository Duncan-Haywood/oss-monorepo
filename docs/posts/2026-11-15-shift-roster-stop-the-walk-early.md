---
title: "Stop the walk when the answer is already no"
seo_title: "Faster call-out risk checks in a shift scheduler: exact early stopping"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, performance]
description: "The second-call-out price spent its time proving moves it would refuse. Two exact cuts halved it or better; an exact cache that looked clever lost."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has a priced
pass, `--cover-price`, that hands shifts around until the week is harder to
break with a call-out. Since yesterday `--second-callout-price` also charges
for pairs of call-outs that can each be covered alone but not together. To
price a candidate move, the pass walks every pair of person-days, about a
thousand on a 40-person week, and runs a small search on each to see whether
both callers' shifts can be handed out at once.

That made the option slow. A seeded 40-person week took 32 seconds where the
pass without it took 2. So the option was capped at 120 shift
copies (shift slots in the week).

**Where the time went.** Most candidate moves that reach the pair walk are
refused. On one 40-person week, all 468 walks tested moves that were then
refused. The walk was counting every clashing pair to the end, when the
answer was "no" long before that.

## Two exact cuts

1. **Stop at the refusal line.** Before the pair walk, everything else
   in the move's price is known: pay and fairness, plus single call-out
   risk. That gives the number of clashing hours at which the move is
   refused. The walk now stops there.
2. **Look where the clashes were.** On its own, the stop saved only
   12-15%: the few clashing pairs were scattered through the thousand. Each
   pair's verdict is independent of the others, so the order of the walk is
   free. The pass now walks first the pairs that clashed on the roster it
   last accepted. A move that leaves them clashing is refused after a few
   searches.

Neither cut changes an answer. Both runs post the same roster, score and
moves, which the eval checks.

| week | before | now | pairs searched |
|---|---|---|---|
| 20-person week 2 | 2.7 s | 1.65 s | 118,227 → 36,864 |
| 40-person week 0 | 32.3 s | 16.1 s | 1,156,395 → 283,507 |
| 40-person week 1 | 6.8 s | 2.6 s | 484,380 → 25,262 |
| 60-person week 0 | 89.7 s | 46.8 s | 4,229,868 → 1,818,194 |

That is real progress, but not enough to lift the cap. The pass without the
pair price takes 1.7 s on the 60-person week, so 47 s is still far too slow
to switch on by default. The cap stays at 120 copies. The next step is to make
each walk cheaper, not just to run fewer of them.

## The clever idea that lost

The plan written down yesterday was different: after a move, re-check
only the pairs that move touches. That can be made exact. Each pair's search
is deterministic, and its only inputs are the starting shift lists of the
people it looks at. If the move changed none of those people, the verdict
can be copied.

I built that, and it gave the same rosters. It was also slower: 8.1 s against
7.0 s on the 40-person week 1. Each search looks at everyone who could take
the callers' shifts, which on these weeks is most of the team. So a move that
changes two to four people's shifts invalidates most pairs, and only 4-17%
were copied. Tracking who each search read cost more than the searches it
saved.

The general lesson is the usual one about caches: measure the hit rate
before paying for the bookkeeping. Here the cheaper trick was to stop
computing an answer once it was settled.

The details, the tables and the eval scripts are in the venture's README
("Only the walks a move can pass"). These are invented teams and seeded
weeks, timed in single runs on one machine.
