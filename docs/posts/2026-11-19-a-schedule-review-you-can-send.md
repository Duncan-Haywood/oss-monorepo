---
title: "From a P6 XER file to a schedule review you can send: ranked corrections on six real schedules"
seo_title: "A P6 schedule review you can send, from an XER file"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, dcma, owners-rep]
description: "XER Schedule Check now writes the review letter: every DCMA and update finding ranked high, medium or low with its activities, printable to PDF."
---

An owner's rep who receives a contractor's monthly Primavera P6 update does
not send back a scorecard. They send a letter: these are the things to fix
before we accept the dates, and these are the activities. Until today
[XER Schedule Check](https://marisstella.app/xer-schedule-check/) stopped one
step short of that: it found the faults and listed the activities, and the
reviewer still had to write the letter.

It now writes the first draft. After a file is checked, the page offers
**Written review to send**: fill in who it is to and from, a reference and any
notes, then print it or save it as a PDF. The command line does the same:

```
node cli.mjs current.xer --previous last-month.xer --report review.html --to "GC scheduler"
```

## How the corrections are ranked

Every failing DCMA point, every failing extra check (loops, out-of-sequence
progress, open finishes), stale stored dates and, when last month's file is
loaded, every kind of change between the updates becomes one numbered
correction, worded as a request, with the exact activities behind it.

- **High:** the dates cannot be relied on until it is fixed. Logic loops,
  negative float, invalid dates, a critical path that does not move the
  finish, actual dates edited after they were reported, critical logic deleted,
  critical durations cut.
- **Medium:** logic that can hide delay. Missing links, leads, hard
  constraints, high float, missed work, out-of-sequence progress.
- **Low:** good practice. Lags, non-finish-to-start links, long durations,
  unloaded activities.

The document has no scripts and no outside files, so it looks the same in a
mail client, an archive or a printer.

## On six real schedules

The six public XER files the engine was
[checked against P6 with](./2026-11-19-reproducing-p6-float-from-an-xer-file.md)
ask for between 2 and 11 corrections:

| File | Open activities | Corrections (high / medium / low) |
|---|---|---|
| sample (P6 20.12) | 42 | 2 (0 / 0 / 2) |
| terminal (P6 5.0) | 66 | 5 (0 / 1 / 4) |
| example (P6 24.12) | 404 | 8 (0 / 4 / 4) |
| Expressway (P6 7.0) | 823 | 7 (0 / 3 / 4) |
| hotel (P6 6.0) | 4,217 | 7 (0 / 3 / 4) |
| CCA (P6 6.0) | 14,270 | 11 (2 / 5 / 4) |

The 14,270-activity file prints in 13 pages, because each correction prints its
first 40 activities and points to the CSV for the rest.

## The first draft was wrong about one file

The hotel schedule's first review opened with a high item: the critical path
test moved the finish 0 days out of 600, so "repair the driving path". Writing
it as a request to a real contractor is what made us check it. The driving path
there is a single finish milestone with an as-late-as-possible constraint and
nothing open behind it. The test had fallen back to delaying that milestone,
and adding duration to a milestone moves nothing. So the "broken path" was the
tool's, not the schedule's. The test now says it could not run and names the
milestone, and the review asks at medium for the logic that drives the finish.
That is a fair question for that schedule, and an accusation would not have been.

Measurements and method: `ventures/xer-schedule-check/eval/review-report-2026-11-19.md`.
The tool is free and MIT licensed, and the file never leaves the browser. Its
results are screening checks, not scheduling, contractual or legal advice.
