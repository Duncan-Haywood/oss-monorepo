---
title: "Reading back a P6 lag someone trimmed on work already under way"
seo_title: "Find P6 lags edited on in-progress activities in an XER"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, schedule-review]
description: "P6 stores the lag it used on every link. On links touching work in progress it stores only the unspent part: 11,610 of 11,610 links decode that way."
---

Every time Primavera P6 schedules a project it writes two dates on each
relationship, in the XER's `TASKPRED` table: `aref` and `arls`. No P6 screen
shows them. Last week [XER Schedule Check](../../ventures/xer-schedule-check/)
decoded them on links between activities that have not started yet: they
carry the lag P6 used at that run. So a lag someone edits afterwards, and
exports without rescheduling, reads straight back, even a shortened one
that leaves every stored date looking fine.

That covered 40,476 links in six public P6 files, but it skipped every link
that touches **work in progress**. In a monthly update review those are the
links that matter most. A lag on a pour that is already under way is where
someone trims a cure time to hold a date.

## What P6 writes there

The same formulas hold, with one change. P6 counts only the part of the lag
still **unspent at the data date**:

- an FS or FF lag runs from the predecessor's actual finish, so once the
  predecessor finishes, the working time since then comes off;
- an SS lag runs from the predecessor's actual start, so once it starts,
  the working time since then comes off;
- whatever is left, never below zero, is the lag in the dates.

On the six files, `arls` matches that rule on **11,610 of 11,610** links with
an in-progress or finished end, across all fifteen combinations of
predecessor state, successor state and link type. The SS links were the
ones that needed it. Read with the whole lag, only 379 of 1,074 in-progress
SS links agree. On 1,073 of them the dates carry no lag at all, because the
predecessor started long enough ago to use it up. The check now covers 9,716
more links than it did.

## What the checker can say

It depends on what was left of the lag when P6 ran:

- **Some of it was unspent.** The old lag reads back exactly. This also
  covers an FS lag from work that has not finished, where nothing has been
  spent.
- **None was left, but the current lag leaves some.** Then the file proves
  the lag changed, but not what it was before, only that it was **at most**
  the working time already spent. The assessment says just that, for
  example: "the lag was at most 40 h (5 d), the working time already spent
  since A1050's actual start". It does not make up an exact value.
- **Nothing is unspent either way.** Cutting a 24 h SS lag to 16 h on an
  activity that started 40 working hours ago changes no date P6 would
  compute, and the file cannot show it.

We planted 380 lag changes on those files without rescheduling. All 185
that the file can show were named: 173 with the old lag exactly and 12 with a
bound that held. The other 195 changed no date, and none of them was listed.
Nothing we didn't plant was listed either. Most real started links have a
lag of zero or one already spent, which is why so many changes can't be
seen. That's a property of the files, not a gap in the check.

The method and every count are in
[`eval/relationship-dates-started-2026-11-24.md`](../../ventures/xer-schedule-check/eval/relationship-dates-started-2026-11-24.md).
What is still open: SF links, SS links whose lag runs on a calendar other
than the predecessor's, and a real statused P6 update with a lag edited on
work in progress. If you have one you can share, it is the next test.

The checker runs in your browser and uploads nothing. It is not legal or
scheduling advice. A listed lag means the file and P6's own records
disagree, and the scheduler should say why.
