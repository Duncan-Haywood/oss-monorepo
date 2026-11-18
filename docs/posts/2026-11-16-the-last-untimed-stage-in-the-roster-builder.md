---
title: "The last untimed stage: a 40 ms pay polish and a pre-registered test"
seo_title: "Shift scheduling search: timing the last untimed stage"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Shift Roster Builder's pay polish ran 25-44 ms past the 20 s budget on 8 of 48 builds. A deadline inside it took that to 0, with pay and open hours held."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) gives a big week
(60-70 people, 170-200 shifts) a 20-second budget. The stage after that budget,
the pay floor, tells a manager how close the roster's pay is to the best
possible, so every millisecond an earlier stage runs over comes out of that check.

Two changes earlier today made the plateau walk and then the cover repair stop
on the clock. That left seven of 48 test builds still 22-48 ms late. The
reason was the same on each: the walk or the repair had stopped on time, but
it had just found a roster covering more hours, and the short pay polish that
follows any such gain had no clock at all. It makes up to about a quarter of a
million single moves and swaps, and on these weeks that takes 28-47 ms.

## The change

The polish now reads the clock every 1,024 moves and returns what it has once
the budget is spent. It can only stop early, never make things worse: every
move it keeps already lowers the score and never opens a covered shift.

## The test, written down first

Small timing changes are easy to fool yourself with, so the rule was committed
before the run ([pre-registration](../../ventures/shift-roster-builder/eval/polish-deadline-prereg.md)):
12 fresh seeds, four week shapes each, every week built with and without the
deadline. The change stays on only if late builds at least halve, open hours
don't rise by more than 2, pay doesn't rise by more than 0.1%, and mean build
time doesn't grow.

| 48 fresh weeks | untimed polish | timed polish |
|---|---|---|
| reached the pay floor more than 20 ms late | 8 (25-44 ms) | **0** |
| latest arrival at the pay floor | 20,044 ms | 20,002 ms |
| open hours | 11,818 | 11,815 |
| pay, 45 weeks with equal open hours | 1,030,595 | 1,030,592 |
| mean build | 22.04 s | 22.01 s |

All four clauses passed. The three fewer open hours and the slightly lower pay
come from timing noise between builds, and we don't claim them as gains.

## What it is worth

This saves 25-44 ms, nothing more. What it finishes is the set: every stage
before the pay floor (the walk, the repair, and the polish after each) now
stops on the clock, so a manager with a 20-second budget gets the pay check
the budget promises. The numbers come from generated weeks on one cloud
machine, and the full write-up is in the venture's README under "The pay
polish stops at the budget's end".
