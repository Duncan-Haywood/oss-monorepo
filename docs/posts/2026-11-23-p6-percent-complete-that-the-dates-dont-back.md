---
title: "Percent complete the dates don't back: a progress review for P6 updates"
seo_title: "P6 progress review: percent complete vs remaining duration, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, progress]
description: "XER Schedule Check now checks each activity's claimed percent against its time spent and remaining duration. On a public hospital update, 1,628 of 2,495 failed."
---

Primavera P6 keeps an activity's progress in two places that don't have to
agree. One is the percent complete. That is either typed in as a physical
percent or worked out from the resource units booked. The other is the
remaining duration, which sets the forecast finish. Change one and P6 leaves
the other alone.

That is why an update can say an activity is 80% done when only a quarter of
its time has gone, and still keep a remaining duration that says the work has
hardly begun. It can also say an activity is 20% done after a month while the
remaining duration promises it will finish next week. The first claims more
progress than the forecast allows for, and a pay application is often priced
off that percent. The second gives a finish date the work's pace doesn't
support. The DCMA 14-point assessment doesn't look for either.

[XER Schedule Check](https://marisstella.app/xer-schedule-check/#progress)
now has a **Review progress** button. For each activity it counts the working
days from the actual start to the data date on that activity's own calendar,
then lists:

- progress claimed 30 or more points ahead of the share of time spent;
- remaining durations that are shorter than a straight line at the pace so far
  (needing 1.5 times as long, and at least 5 working days more);
- work that started at least 5 days ago with 0% claimed;
- activities now forecast at 1.5 times their original duration;
- work in progress with no remaining duration, or at 100%, that was never
  finished;
- progress on activities that haven't started;
- finished activities left below 100% physical.

The pace checks only apply to physical and units percent. A duration percent
is worked out from the durations, so it can't disagree with them.

## What it found in a real update

The public 16,000-activity hospital update the tool is tested on (data date
30 September 2011) has 2,495 activities in progress. On 1,628 of them, the
remaining duration is shorter than the pace so far supports. The typical one
is 40% done after 72 working days, with 30 days left in the schedule. At the
same pace it would need about 102. Every one of the 1,628 uses units percent.
The percent comes from the hours booked, while the remaining duration is kept
by hand, and the two had drifted apart. 1,434 activities are now forecast at
a median of 2.5 times their planned length. 62 are in progress with zero days
remaining, so P6 quietly finishes them at the data date. Most likely someone
forgot to enter the actual finish.

A straight line at the pace so far is where a reviewer starts, not a
forecast. Work that stopped and restarts will look worse on it than it is.
The list is sorted by size so the scheduler gets asked about the biggest gaps
first.

## How we checked it

On copies of the six public files, 40 activities per file that weren't
already flagged were each given one defect of a randomly chosen kind. That
made 230 defects in all, written into the activity rows the way an update
would carry them. All 230 were named with the right kind on each of three
random seeds, and no other activity gained or lost a flag. The method and the
numbers are in the venture's `eval/progress-review-2026-11-23.md`.

The thresholds (30 points, 1.5 times, 5 working days) are review habits, not
a published standard, so they are options on the command line:
`node cli.mjs update.xer --progress --ahead-points 20`. Like everything else
on the page, it runs in your browser and the file is never uploaded.

This is a screening aid, not professional scheduling or legal advice. Have a
qualified scheduler review an update before relying on it.
