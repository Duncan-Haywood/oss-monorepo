---
title: "A three-week look-ahead from a P6 XER, and what it says about seven real schedules"
seo_title: "Three-week look-ahead from a Primavera P6 XER file"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer]
description: "The site meeting's look-ahead built from the XER: bars per working day, what each activity waits on, checked against P6's own dates on seven files."
---

Most construction site meetings run on a look-ahead: the next three weeks of
work, area by area, with a bar for each day and a note of what each activity
still waits on. The master schedule lives in Primavera P6, but the
superintendent usually doesn't have a P6 seat. So someone filters a layout,
prints it to PDF, or copies dates into a spreadsheet every week.

[XER Schedule Check](../../ventures/xer-schedule-check/) now builds that sheet
from the `.xer` file itself, in the browser. Open the file, pick the number of
weeks (three by default) and, if you want, a later start date. You get:

- every activity with work in the window, grouped by WBS in the file's own
  WBS order;
- a bar for each day the activity works on its own calendar, so holidays and
  six-day crews show as they are, with critical work in red;
- a **make-ready** column from the logic. Each activity is marked *ready*
  (every finish-to-start predecessor has finished, every start-to-start one
  has started, and no lag is still running), *waits* (it names the activity
  it waits on and the date that activity is due), *waits outside* (on work
  outside the window or in another project) or *no predecessor*;
- what sets each start: the driving link, a start constraint, the data date
  or the project's planned start;
- started work whose predecessors haven't finished, marked out of sequence.

It prints as a landscape sheet for the meeting and downloads as a CSV with
one column per day. On the command line:
`node cli.mjs schedule.xer --lookahead 3 --html sheet.html`.

## Checked against P6's own dates

The dates come from the tool's own CPM engine, which matches the dates P6
stored on 19,820 of 19,822 open activities in six public files. For the
look-ahead the question is narrower: does it put the same activities in the
window as P6's stored dates would? I ran that on seven public P6 exports for
windows of 1, 3 and 6 weeks.

| Window | In P6's window | Same in the look-ahead | Bars on a wrong day | "Waits" consistent with P6's dates |
|---|---|---|---|---|
| 1 week | 1,468 | 1,467 | 0 | 142 / 142 |
| 3 weeks | 2,071 | 2,069 | 0 | 359 / 359 |
| 6 weeks | 2,940 | 2,940 | 0 | 758 / 758 |

The three that differ are all the same two activities in the largest file.
They sit behind a 608-hour lag that someone lengthened after P6 last
scheduled the project, so P6's stored dates are the stale ones. At six weeks
both dates land inside the window and the lists agree. Method and per-file
numbers are in
[`eval/lookahead-check-2026-11-19.md`](../../ventures/xer-schedule-check/eval/lookahead-check-2026-11-19.md).

## What the make-ready column found

The point of the column is to show the meeting something it wouldn't see on
a bar chart. Two of the seven files show what that looks like:

- **Expressway (P6 7.0).** In the first three weeks, 47 of the 87 activities
  have no predecessor at all. All of them start on 16 July for one reason:
  that is the project's planned start. On a bar chart that looks like a busy
  first week. In the make-ready column it reads as 47 open starts. That is
  the DCMA "missing logic" finding turning up as a site problem: nothing in
  the schedule says which of those 47 crews should go first.
- **CCA (P6 6.0, 16,000 activities).** 592 of the 1,465 activities in
  progress in the window started before a predecessor finished. The project
  uses retained logic, so P6 holds their remaining work until that
  predecessor is done. Their bars show that wait rather than the crew already
  on site, and the sheet names the predecessor.

## What it can't know

"Ready" here is ready *by the logic*. A real make-ready review checks crews,
materials, information, permits and inspections. None of those are in a P6
file, and the sheet says so. A constraints log (materials, permits and RFIs
as a CSV, merged into the make-ready column) is the next piece. Beyond that,
the real test is a superintendent using it at a real meeting.

Along the way I found a small bug. The command line exited straight after
writing its output, which cuts output to a pipe off at 64 KB. A
`--float-paths --json` run on the large file stopped at 81,920 of 93,526
bytes. Every branch now waits for the write to finish before it exits.

Free, MIT licensed, and the file never leaves the browser. It is a screening
aid, not scheduling or contractual advice.
