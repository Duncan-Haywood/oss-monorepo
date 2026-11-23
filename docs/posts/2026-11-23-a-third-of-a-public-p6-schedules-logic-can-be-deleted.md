---
title: "A third of a public P6 schedule's open logic can be deleted without moving a date"
seo_title: "Find redundant logic in a P6 XER schedule, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, schedule-quality]
description: "XER Schedule Check now finds P6 relationships another chain of links already implies. On a public 16,000-activity file, 12,283 went with no date moved."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads Primavera P6
`.xer` exports in the browser. It now has a **Find redundant logic** button.

A relationship is redundant when another chain of links already says what it
says. If A finishes before B starts and B finishes before C starts, a link from
A to C cannot move C, however long A, B and C turn out to be. Schedules collect
these: a fragnet tied both step to step and to its start, a block copied with
its links and then re-tied. P6 shows driving and non-driving links for this
month's durations, which change every month. It does not say which links can
never drive at all.

## The test

Each activity is two events, a start and a finish, and the finish is never
before the start (a duration can shrink to zero, never below). Each link says
one event comes at least its lag after another: finish to start for FS, start
to start for SS, and so on. A link is redundant when some other path between
the same two events carries at least as much lag. That holds for any
durations, so deleting the link cannot change a date in this update or a
later one. Where the lags being compared sit on different calendars, the link
is marked "check" rather than sure, and stays in the downloaded file.

## What it found

On the six public P6 files the project tests against:

| File | Open links | Redundant |
|---|---|---|
| CCA programme, 16,000 activities | 35,272 | 12,285 (34.8%) |
| Hotel | 7,586 | 587 (7.7%) |
| Expressway | 1,094 | 52 (4.8%) |
| Airport terminal | 84 | 4 (4.8%) |
| P6 analyzer example | 518 | 11 (2.1%) |
| Small sample | 41 | 0 |

In the CCA file they are spread out: 5,658 different predecessors. 5,779 are
implied by a two-link chain, 3,313 by a three-link chain and the rest by longer
ones. A few activities carry 181 redundant successor links each.

## Checked by deleting them

The claim is checkable, so it was checked. Every link marked sure was deleted
from a copy of each file at once, and both copies were rescheduled. Then every
activity's early and late dates, total float and free float were compared.
That was done with the file's own durations and again with five random sets
of durations. Not one value moved: 15,849 activities compared six times on
CCA after deleting 12,283 links. As a control, deleting the links that have
another path but carry *more* lag than it did move dates: up to 6,476
activities on CCA, and the finish in one draw. So the comparison can see a
change when there is one. Duplicates and A-to-C links planted over A-to-B-to-C
chains were found 240 times out of 240.

The download is the original file less those `TASKPRED` rows. Every other
line is kept exactly as exported, ready for P6's import. That import itself
has not been tried yet: no P6 seat here.

## Why bother

Redundant links make the relationship count look healthier to a DCMA or GAO
reviewer than the network is. They also make a hand trace of the driving path
slower. And when the activity that carried the real logic is deleted in a later
update, the redundant link quietly becomes the only tie. A paid analytics
product includes a redundant-logic metric. This one is free, runs in the tab
and shows the chain behind each link.

The method and numbers are in the project's
`eval/redundant-logic-2026-11-23.md`. There is also a guide:
[How to find redundant logic in a P6 schedule](../../ventures/xer-schedule-check/how-to-find-redundant-logic-in-a-p6-schedule.html).
