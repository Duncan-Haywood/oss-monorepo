---
title: "A floor that lets shifts split made one test search for hours nobody could cover"
seo_title: "A whole-shift floor as a stop rule halves a scheduler test"
date: 2026-11-16
description: "Our rota builder's open-hours floor let a 16-hour worker hold 10 h of one shift and 6 h of another. Requiring whole shifts halved a 62 s test, same answers."
tags: [shift-roster-builder, performance, optimisation, testing]
---

The [shift roster builder](../../ventures/shift-roster-builder/README.md) fills a week of shifts
from a staff list and tries to leave as few hours open as it can. One part of that, the cover
walk, keeps moving shifts between people looking for a roster with fewer open hours. It stops
early when it reaches a *floor*: a number of open hours that has been proven to be the least any
valid roster can leave. Nothing can beat a proven floor, so stopping there costs nothing.

That only works if the floor is tight. Ours was computed as a max flow, where each shift's minutes
flow to people who may work it, and each person can absorb up to their weekly hours. A flow is
allowed to split. So a person with a 16-hour week and two shifts of 10 and 9 hours "covers" 16 of
those 19 hours in the flow, leaving 3 open. In any real roster they work one of the two shifts,
and at least 9 hours stay open.

## Where it showed up

One test checks the exact solver against brute force. It pins three people (or nobody) to four
shifts in every possible way, 256 combinations on each of six weeks, and asks the builder to price
each one. Many of those pins over-book someone. On those, the builder leaves hours open, the floor
says fewer could be open, and the cover walk runs all twelve of its passes to the step limit
looking for hours that no roster can cover. That test took 62 seconds, and one over-booked pin took
252 ms, 185 ms of it in the cover walk.

## The fix

A roster never splits a shift, and the weekly-hours rule adds up whole shifts. So each person's
capacity in the flow can be the largest sum of whole shifts they are eligible for that fits in
their hours, a small subset-sum problem. That floor is still a valid lower bound, and it is never
below the old one. On the 60 small weeks our tests brute-force, it equals the true minimum on 31 of
the 52 that must leave hours open. The old floor managed 16.

The cover walk now stops on the tighter floor. Its result cannot change: it keeps a new roster only
when it leaves strictly fewer open hours, and nothing gets below a valid floor. We checked this
rather than assume it. All 1,536 pinned builds and 135 seeded weeks gave identical output with the
old and new code. The test went from 62.2 to 33.7 seconds. The over-booked pin went from 252 ms
to 38.5 ms.

We kept the rest of the builder on the old floor for now. Using the tighter one everywhere would
also skip a repair step more often, and that step can still find a roster with the same open hours
but fewer open shifts. That would change answers, so it needs its own benchmark first.

Details, numbers and what's left:
[`docs/history/ci-perf-2026-11-16-shift-roster-whole-shift-floor.md`](../history/ci-perf-2026-11-16-shift-roster-whole-shift-floor.md).
