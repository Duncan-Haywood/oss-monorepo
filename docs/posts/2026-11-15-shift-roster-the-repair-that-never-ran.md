---
title: "The repair that never ran, and the guide that didn't help it"
seo_title: "Shift scheduling repair search: when an LP guide adds nothing"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Steering Shift Roster Builder's exact repair with an LP: the repair barely ran on big weeks, and the LP picked people no better than random."
---

Earlier today the [Shift Roster Builder](../../ventures/shift-roster-builder/)
learned to steer its cover passes with an LP. A clique LP over the week
says, fractionally, who should hold which shift. Letting half the fill
steps try the person that LP suggests cut open hours on 14 of 30 paired
builds and raised them on 3. The obvious next step was to give the same
guide to the engine's other search, the exact repair.

The repair is a large-neighbourhood search. It picks three people, releases
every shift they hold, and solves those shifts plus every open shift
exactly, with everyone else held fixed. It picks the three at random. Using
the LP to pick them seemed like an easy win.

## First, what the repair actually did

Before changing anything, I looked at what the repair was doing on the
350-400 shift-copy weeks it was meant to help. On most builds it got
**0 ms**. The plateau walks before it run until the 20-second budget is
gone, so it never starts.

When I gave it time, it still did little. Every round stopped at its
200,000-node cap. A three-person neighbourhood on those weeks holds about
68 open shifts. The depth-first search started each round with no bound,
so it often never found even the roster it started from. On one 90-person
week its best was 361 open hours, while the roster it held had 356.

So I fixed the search before touching the guide:

- Each round now has to beat the neighbourhood as it stands, so pruning
  starts at the first node.
- Shifts none of the three people can take are counted once and not
  branched on.
- A second bound uses weekly hours. The hours still to place, minus what
  those three people can still work, must stay open.

Both bounds only relax the rules. A new test compares a repair over
everyone with brute force on 60 tiny weeks, and they agree on all 60.

## Then the guide

A guided round builds its three people as a chain. It starts from an open
shift and draws a person the LP puts on it. Next it takes a shift that
person holds which the LP mostly gives to someone else, then draws that
someone, and so on.

To keep the noise of the time-bound passes out of the result, I measured
the repair on its own. I took the eight 80-100 person bench weeks, made
three fixed starting rosters for each, and ran each repair under the same
node budget:

| 24 starts | total open hours | hours cut |
|---|---|---|
| the old repair | 8,455 | 206 |
| bounded, people at random | **8,444** | **217** |
| bounded, LP picks half the rounds | 8,443 | 218 |
| bounded, LP picks every round | 8,481 | 180 |

The bound is a small, real gain: fewer open hours than the old repair on 8
starts, more on 1 (sign test p = 0.039). The guide is not. Against random
people it was better on 11 starts and worse on 9 (p = 0.82). Guiding every
round was worse, because it keeps searching the same corner of the week.

End to end, nothing moved. With the default 20-second budget, the eight
weeks at three search seeds each left 7,631 open hours under the old
engine. With the bounded repair it was also 7,631. With the guided repair
it was 7,635, and with time held back for the repair, 7,639. Each was at
the proven floor on 13 of 24 builds (12 with the reserve). Those gaps are
run-to-run noise. On 40 small weeks with no time budget, every roster was
identical to before.

So the bound ships on by default, and the guide ships opt-in
(`repairGuide: true`). The repair now also stays inside the time budget.

## Why the same trick worked once and not twice

In the cover passes, the LP picks among moves the walk would have tried
anyway, and each try costs microseconds, so a better pick shows up quickly.
The repair's cost is the depth-first search inside the neighbourhood. That
search doesn't finish over 50-80 shifts, wherever the neighbourhood is.
Even bounded, it closes about 9 of the 46 hours each start leaves above the
proven floor.

The next thing to try is a neighbourhood solved by something other than
depth-first search: the max-flow bound the engine already has, or the
clique LP restricted to the chosen people and then rounded. Picking better
people for a search that can't finish won't get there.

Everything here is on generated weeks, with three starts or three seeds
each, on one cloud machine. The numbers and scripts are in the README
section "The clique LP picks the repair's people" and in `eval/repair-*`.
