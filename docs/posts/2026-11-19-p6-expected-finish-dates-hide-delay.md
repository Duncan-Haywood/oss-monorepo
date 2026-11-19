---
title: "P6 expected finish dates: the setting that lets an activity swallow a slip"
seo_title: "Primavera P6 expected finish dates and hidden delay"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, schedule-review, critical-path]
description: "With 'use expected end dates' on, P6 shortens an activity to hit a typed date, so upstream delay vanishes. XER Schedule Check now models it and lists each one."
---

Primavera P6 has a schedule option called **use expected end dates**. Turn it
on, type an expected finish on an activity, and P6 stops treating that
activity's remaining duration as an estimate. Each time it schedules, it sets
the remaining duration to whatever working time is left between the start of
the remaining work and the date you typed. If a predecessor runs two weeks
late, the activity gets two weeks shorter and finishes on the same day. Nothing
after it moves.

Sometimes that is right: a crew really will finish on a fixed date. But in a
schedule update a contractor sends an owner, it is also an easy way to hide
delay. The DCMA 14 points don't look for it, and the dates P6 stores look
normal.

## What changed in XER Schedule Check

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a P6
schedule from its logic in the browser. Until today it ignored expected
finishes. On an unchanged file that made no difference, because P6 has
already written the shortened durations into the file. In any what-if,
though, the engine was wrong: the critical path test, last month against this
month, the half-step split, the risk run and levelling. Now:

- When a project has the option on, the engine does what P6 does. The
  remaining duration runs from where the remaining work starts to the expected
  finish. If the expected finish is at or before that start, it is ignored and
  the stored duration stands.
- A new finding, **Expected finish dates setting durations**, lists every
  such activity. For each one it gives the duration the date set against the
  original duration. If the file records percent complete, it also gives the
  time left at the rate the work has gone so far. Dates that have already
  passed are listed separately, to be cleared. The written review ranks the
  finding medium, as logic that can hide delay.

## Checked on a real file

Of the six public XER files used to check the engine, one P6 24.12 export
stores expected finishes, on 23 open activities. The full write-up is
[eval/expected-finish-2026-11-19.md](../../ventures/xer-schedule-check/eval/expected-finish-2026-11-19.md):

- On 21 of the 23, the expected finish is after the remaining start. On all
  21, P6's stored remaining duration is exactly the working time to the
  expected finish.
- The other 2 have expected finishes from before the data date. P6 ignored
  them and kept their durations, and the engine does the same.
- We then added 80 hours to each of the 21 stored durations. With the rule on,
  the engine still reproduced P6's early finish, late finish and total float
  on 404 of 404 open activities. With it off: 0 of 404.
- Delaying each activity's latest-finishing predecessor by 10 working days
  moved two of them **0 days instead of 10**. One of those slips would
  otherwise have reached the project finish (0.9 days).
- The percent-complete note is where a reviewer will look first. One activity
  is 2% done after 22 working days, and its expected finish leaves it 6.4 days.
  At the rate so far it would need over 1,000.

This rests on one file, so it is thin evidence. If you have a P6 export that
uses expected finishes, especially two updates of the same job, that is the
check we want to run next. Everything runs locally: the
[tool](https://marisstella.app/xer-schedule-check/) never uploads the
schedule.

*Screening output, not scheduling, contractual or legal advice. Not affiliated
with Oracle or Primavera; P6 is named only to describe the file format.*
