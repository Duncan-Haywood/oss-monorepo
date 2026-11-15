---
title: "A scheduling check whose answer depended on the order it searched"
seo_title: "Making a depth-first cover search order-independent in shift rosters"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Shift Roster Builder's second-call-out check gave different exact answers in different search orders. The definition that fixed it, and why it stays exact."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an
opt-in price for second call-outs. For every pair of working days that
could each be covered alone if that person called out sick, it asks
whether both could be covered in the same week. A small depth-first
search answers this by handing the two callers' shifts to other people.
A stand-in can also pass one of their own shifts to someone else to make
room. That is a hand-over chain.

The [last post](2026-11-15-shift-roster-a-cache-that-was-always-right-and-never-useful.md)
ended on an awkward finding. Even with the search run to the end and no
pair given up, the count changed with the order the search handed out
the shifts: 179 or 187 clashing pair hours on one seeded 20-person week,
and 313 to 355 on a 40-person week. A complete search should not care
about order. This one did, so its "exact" answer was a fact about the
search, not about the roster.

## Two ways order leaked in

The first was in the rules for chains. A chain could pass on a shift the
same search had handed that person moments earlier, and the limit of
"two passes per shift" was counted in the order the passes happened. So
the same limit allowed different sets of covers in different orders.

The second was in when each hand-over was checked. Every hand-over was
checked against the lists as they stood at that point. Suppose Dev can
take Monday's late shift only after giving up his Tuesday early shift.
If the search reaches Monday's late shift before it considers Dev's
swap, it refuses him. The order decides which covers it can see.

## Ask about the roster instead

The fix was to define the check by the roster it ends with, not by the
steps the search takes. A pair is covered when some covered roster
exists where every lost shift goes to someone eligible, and where each
person gives up at most two shifts they already held, and only in
exchange for taking one. The give-ups must be on or after the earlier
call-out day, the pair's total matches the old limit, and every person's
final list keeps every hard rule. Nothing in that definition mentions an
order.

The search still works step by step, and it still checks every
hand-over on the current lists. What makes that exact is that the hard
rules are *downward closed*: dropping a shift from someone's week never
breaks rest gaps, overlaps, weekly or daily hours, or days in a row. If
each person gives up their shifts together with the first shift they
take, every list the search checks is part of that person's final list.
So a check that fails on the way would also fail at the end, and the
pruning never cuts a real cover. The tests compare it against an oracle
that asks the same question another way (choose the given-up shifts
first, then assign everything). They agree on every pair of five small
seeded weeks. The verdict is also the same in five hand-out orders,
including random shuffles.

## The first rule I picked was too strict

The simplest exact rule allowed one give-up per person. I checked it
against the product's own yardstick, which plays each pair of call-outs
through the week as real reissues and sees whether hours open. On the
priced retail template it flagged 82 pairs where the old check flagged
55. None of the 27 extra pairs opened any hours. The same stand-in
often covers both callers and needs room twice. With two give-ups per
person, all taken together with that person's first shift, the
order-free check flags 180 of 337 template pairs against the old 186.
Precision is 59.4% against 58.1%, and recall is 90.7% against 91.5% (one
more missed pair).

## Making it fast

A new definition is no use if it is slow. Three changes kept it exact
and made it fast.

1. **Look ahead.** Before each hand-out, every shift still waiting must
   have someone who could take it. If one has nobody, the branch is
   cut. The shift with the fewest takers goes next. That dynamic order
   is allowed now because order can't change the answer.
2. **Ask a narrower question first.** One round allows at most two
   passes per chain and one give-up per person. Any cover it finds is
   a real cover, and the full question runs only when it finds none.
   On a 60-person week this took the pairs given up at 2,000 checks from
   1,592 to 1.
3. **Give the confirming walk more room.** At 2,000,000 checks no pair
   was given up, and the walk took about the same time (under 0.9 s), because only
   a handful of pairs need it.

Some things didn't make it. Deepening one pass at a time was worse,
because every shallow round that fails has to search its whole tree.
Accepting a hand-over on the promise of a later give-up was exact but
pruned almost nothing, at about 2 s a walk.

## What it changes

With the order-free check, the 20-person week's count is 148 pair hours
in every order (the old check said 179 or 187). The 40-person week's is
99 in every order (the old check said 313 to 355). The opt-in is
`--second-callout-order-free`. It stays off by default for now. On the
templates it is about as accurate as the old check, not clearly better.
Its 500-check screen also gives up on more pairs on the 40- and
60-person weeks, so the priced pass does not get faster yet. The full
numbers, and the priced pass with each check, are in the README section
"An order-free pair check".

All of this is on invented teams and seeded weeks, on one 4-core cloud
machine. The tool is free and MIT licensed, and it runs in your browser.
