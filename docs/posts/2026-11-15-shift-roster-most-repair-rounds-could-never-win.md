---
title: "Two of every three repair rounds could never win, and a max flow knew it first"
seo_title: "A max-flow bound for large-neighbourhood search in shift scheduling"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "A max-flow floor per neighbourhood let Shift Roster Builder's exact repair skip hopeless rounds. It closed 484 open hours where the old search closed 217."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an
exact repair step. It picks three people, takes back every shift they
hold, and re-solves those shifts plus every open one, with everyone else
held fixed. A single-move search can't make a gain that needs three
people to change at once. This step can.

On big weeks (80 to 100 people, about 300 to 400 shifts) it barely
worked. Each round's depth-first search ran out of nodes before it
finished. Over 24 fixed starting rosters, which left 1,113 hours open
above the proven floor between them, it closed 217.

## Where the nodes went

Two things were eating the search.

First, most neighbourhoods had nothing to give. Take three people at
random and, more often than not, the shifts they hold and the open
shifts they could take are already arranged as well as they can be.
The search still had to fail to find anything better before it could
give up, and in a 70-shift neighbourhood that takes the whole node
budget.

Second, shifts that were already lost stayed in play. Once a chosen
person takes a shift, the rest rule or their weekly hours may close
other shifts to them. When a shift is closed to all three people, it
will stay open whatever happens deeper down. The old bound only counted
it when the search reached it.

## A floor for each neighbourhood

The roster builder already had a max-flow floor for the whole week. It
sends each shift's minutes to a person-day, caps each day by its longest
chain of shifts that respect the rest rule, and caps each person by
their weekly hours. Every rule only relaxes, so no real roster covers
more than the flow.

The same flow, cut down to the three chosen people and the free shifts,
gives a floor for one neighbourhood. It takes well under a millisecond.
If the floor already equals the open hours the neighbourhood has now,
the round is skipped without a search. On the bench weeks that was
about two rounds in three. If the search reaches the floor, it stops,
because nothing lower exists.

Inside the search, each chosen person keeps a row of the shifts they can
still take. When a shift is closed to all three, its hours count as open
straight away.

## What changed

Same 24 starts, same node budget per round:

| repair | hours closed |
|---|---|
| depth-first search (before) | 217 |
| flow-bounded search | 484 |

It left fewer open hours on all 24 starts. Given the same 2 seconds
instead of the same node budget, it closed 691 hours against 534, ahead
on 19 starts and behind on 3.

## What did not change

Posted rosters. In a full build at the default 20-second budget, the
earlier search passes use almost all the time, so the repair gets
about 0.2 seconds and does little either way. On 24 full builds both
versions left 7,633 hours open in total. With 2 seconds held back for the
repair, the flow version left 7,613 against 7,629, better on 6 builds
and worse on 2. That's suggestive but not significant, so the
reserve stays off.

So the repair is now a much better search, and the next question is
whether it deserves more of the clock. The measurements, scripts and
tests are in the venture's README under "The repair's neighbourhood
under a flow bound". As always, these are generated weeks, not a real
business's roster.
