---
title: "A lower bound the levelled schedule beat, and nights counted as overtime"
seo_title: "P6 resource levelling: a finish bound with max units that change"
date: 2026-11-19
tags: [redteam, testing, primavera-p6, resource-levelling, scheduling]
description: "20 faults seeded in an XER checker's levelling, 10 caught; 4 real bugs fixed, one a 'no levelling can finish before' date its own schedule beat by a week."
---

The [XER schedule checker](https://marisstella.app/xer-schedule-check/) reads a Primavera P6
export and, among other things, levels it: it delays activities that have not started until
each resource stays within its maximum units per hour, the way P6's Level Resources does. It
also prints a date it calls *the earliest any levelling can finish*: a resource's remaining
work, done at its limit without a break, needs at least that long. A scheduler uses that date
to tell "the crews are too small" apart from "the levelling made a poor choice".

This red-team run seeded 10 faults in `level.mjs`, which landed the day before, and 10 in
`calendar.mjs`, which every date in the product depends on. It then read the code as an
attacker. The suite caught 10 of the 20 seeded faults (4 of 10 in the levelling, 6 of 10 in the
calendar). Two of the 10 that got through could not change anything a user sees. Every other
one is now caught by a new test.

## The bound was not a bound

P6 lets a resource's limit change over time: an `RSRCRATE` row per date, say a crew of two
until 8 December and one after. The bound priced all the remaining work at the *last* row's
limit. On a two-activity test schedule, a crew of two that drops to one later:

| | before | after |
|---|---|---|
| levelled finish | 2025-12-05 17:00 | 2025-12-05 17:00 |
| "earliest any levelling can finish" | **2025-12-12 17:00** | 2025-12-05 17:00 |

The tool's own levelled schedule finished a week before the date it said nothing could beat.
The error went the other way when a limit rises later: the bound came out too early, a weaker
claim than the data allows. The bound now works through the limit in force on each date, on
the project calendar, until the work is done. A period with no limit given (a zero row in P6
means "none set", not "none allowed") could absorb all the work, so it gives no bound at all.

## Nights and weekends counted as hours over the limit

The resource table's "hours over the limit" counted elapsed clock time. Two 5-day activities
side by side on a crew of one overlap for 40 working hours. The table said **105**, because the
nights and the gaps between shifts were counted too. Both the before and the after columns are
now in working hours on the project calendar.

## A self-check that "must be 0" read 105

With P6's "level within float" option on, an activity that would need to move past its float
stays where it is, over the limit, and is listed with the reason. The self-check (hours a placed
activity passes a limit, documented as zero on a correct run) still counted it, so a correct run
read 105 h. That activity now counts as left unlevelled, like the others in that list: it is
kept out of the self-check and the lower bound, and the resource's "left" count includes it.

## 25:00 was a valid clock time

The calendar parser took any one- or two-digit hour, so `25:00` and `17:60` gave working
periods that ran into the next day and moved every date that used that calendar, with no
error. It now refuses anything past `24:00` with the "bad time" error it already gave for
text that is not a time at all.

## A guard that runs on every PR

The bound bug was easy to miss because every existing test used a single limit. The run added
a seeded property test: 60 random small schedules with one to three limit periods, some with
"level within float" on. Each must have a self-check of 0 and a bound no later than its own
levelled finish. Run against the code before this fix, it fails on its sixth schedule.

One caveat: the six public P6 files in `eval/level-check-2026-11-19.md` are fetched for that
check, not committed, so this run could not re-run them. That table has no over-limit-hours
column, and its self-check zeros stay zero in either unit. Its one bound figure (hotel's
2019-02) holds only if R-7's limit never changes over time. The next run that fetches the files
should re-run the check.
