---
title: "A schedule review that asks where the recovery plan is when revisions quietly cancel a slip"
seo_title: "Windows delay analysis in a printable P6 schedule review"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, delay-analysis, schedule-review]
description: "The written P6 schedule review now carries the windows analysis: revisions to justify, recovery plans to ask for, and an appendix with every activity."
---

An owner's representative reading a contractor's monthly schedule update
wants two answers. Is this update fit to rely on? And when the finish date
moved, why did it move? [XER Schedule Check](../../ventures/xer-schedule-check/)
already wrote the first answer up as a document you can print and send:
corrections ranked high, medium and low, each with the activities behind it.
Earlier today it also learned the second answer, a
[windows analysis](2026-11-19-windows-delay-analysis-p6-xer-updates.md)
across every update of a job. Until now the two did not meet. The analysis
lived on the page and the review left it out.

Now they meet. Run the windows analysis on the job's updates, then print the
review of the latest one, and the review gets a **Delay by window** section:
each window's finish movement, how much of it came from progress and how much
from revisions, and the activities on the driving path behind it. The section
also adds two kinds of correction.

**Revisions that moved the finish later.** Say the contractor changed logic,
durations, constraints or calendars between two updates, and the half-step
run says those revisions alone moved the finish 7 working days. The review
asks the contractor to justify each change it lists, and to say whether it is
a change to the work or a correction of the plan. That is medium priority from
a working week up and low below that. It does not say who is responsible.
That is a matter for the contract.

**Revisions that cancel a slip.** This pattern is easier to miss. Progress
on the driving path lost 7 days, and in the same update the remaining work
was shortened or re-sequenced, which took 5 of those days back. The forecast
finish moved only 2 days, so a reader who looks only at the finish date sees
almost nothing. The plan holds on paper only if the compressed work really
can be done faster. When revisions take back 2 or more of the days progress
lost, the review asks for the recovery plan behind them and lists both the
slipped work and the revision.

A big schedule has one more problem: a correction can sit on hundreds of
activities. The body prints the first 40 of each. Until now the rest went in
a CSV you had to send alongside. A new option adds an appendix that lists
every one, so the PDF on its own is the complete record.

## How it was checked

No public series of real monthly P6 updates exists, so we made some. We took
the six public XER files used for every other check of this tool, from P6
5.0 to 24.12 and from 42 to 14,270 open activities, and used each one as the
first update of a series. Each was statused "as planned" four times, 20
working days apart, with known changes planted in each window: a progress slip
in window 2, a re-estimated activity on the driving path in window 3, and in
window 4 a slip that a duration cut on later driving-path work partly
cancels. Every update was written to disk as an `.xer` file, and the command
line tool read the files in shuffled order and wrote the review with the
appendix.

The results are in
[`eval/review-windows-check-2026-11-19.md`](../../ventures/xer-schedule-check/eval/review-windows-check-2026-11-19.md).

Writing the files to disk turned up a bug in the new XER writer. P6 Web
exports store each calendar as one value that runs over many lines, and P6
Web wraps it in quotes. Our first writer dropped the quotes. The 24.12 file
then read back with its calendars cut short, and its "as planned" window moved
the finish 20.7 days when it should have moved none. The writer now quotes the
value the way P6 Web does, and the 24.12 file reads back the same as the
original.

## What it is not

The section names candidate activities for each window. It does not say
which party caused a delay, or whether a delay is excusable or compensable.
Those questions belong to the analyst and the contract. The review is free,
runs in your browser and never uploads the schedule. It is not engineering,
legal or scheduling advice.
