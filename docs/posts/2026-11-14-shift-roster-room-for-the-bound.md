---
title: "Ten open hours back on a 100-person week, by giving the slower proof less time"
seo_title: "Ten fewer open hours on a 100-person week, same 20 s budget"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, operations-research, optimization]
description: "On the biggest weeks the roster builder spent 9 s on a proof that never finished. Giving that time to a cheaper LP left 376 open hours instead of 386."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) runs several
passes inside a 20-second budget when it builds a big week. On the largest week
it accepts, 100 people and 400 shift copies, two of those passes were
competing for the same seconds, and the wrong one was winning.

The first is a column generation that tries to prove the whole roster
cheapest, pay included. It gets half of the time left, about 9 seconds here.
On these weeks it never finishes. It stops with a lower bound of about 294 open
hours, which is weak. The second is a compact LP over the same week, one row
per group of shifts that clash under the rest rule. On these weeks it proves
358 and 344 open hours are unavoidable, and its solution also guides the
day-by-day re-solve that runs at the end. It needs about 10 to 15 seconds. After
column generation's half there was not enough time left, so its time gate
skipped it every time, and the day sweeps ran without a guide.

**The change** is one function. Column generation still gets half of what is
left, except when that would leave the clique LP less than its expected cost.
Then column generation gets what leaves the clique LP that cost plus a second,
and never less than a second. At the default budget this only applies to
weeks of about 355 copies and up.

| 20 s budget, single runs | before | after |
|---|---|---|
| 100 people, week 0 | 386 open hours | **376** |
| 100 people, week 1 | 353 | **351** |
| 90 people, three weeks (mostly below the cut-off) | 354, 229, 376 | 355, 226, 376 |

The score gap the page reports, between the roster and what the engine proves
possible, also shrinks a lot on the 100-person weeks: from $9.2 M to $1.8 M and
from $6.5 M to $0.7 M in the engine's units, where an open hour counts 100,000.
With no time limit the engine reaches 359 and 347 hours on the same two weeks,
so the budgeted shortfall went from 27 and 6 hours to 17 and 4.

What this does not show: these are two generated 100-person weeks (the
generator's other two seeds go over the 400-copy cap) and single runs on one
cloud machine. The 90-person rows moved by about the noise the time-bound
passes always have. The numbers are in
[`eval/clique-room.out.txt`](../../ventures/shift-roster-builder/eval/clique-room.out.txt)
and the README section "Room for the clique LP on the biggest weeks".

This is an estimate tool, not legal or HR advice. Check the posted roster
against your own labour rules.
