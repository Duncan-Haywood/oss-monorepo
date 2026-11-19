---
title: "A windows delay analysis from a stack of P6 updates, and the re-estimate we were counting as progress"
seo_title: "Windows delay analysis from Primavera P6 XER updates"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, delay-analysis, critical-path]
description: "Open every XER update of a job at once and get each window's finish slip, split into progress and revisions, with the driving-path activities behind it."
---

When a job finishes late, someone has to say where the time went. The usual
method on a project with monthly schedule updates is a windows analysis
(AACE calls the family "contemporaneous period analysis"): take each pair of
consecutive updates, measure how far the forecast finish moved between them,
and find the activities on the critical path that moved it. Claims
consultants charge by the hour for this. Most of those hours go on opening
two files in P6, comparing them, and typing up the result, and doing that
once per month of the job.

[XER Schedule Check](../../ventures/xer-schedule-check/) now does the
mechanical part. Open all of a job's `.xer` exports at once, in any order.
The tool sorts them by data date. For each window it gives you:

- how far the forecast finish moved, in working days;
- a **half-step** split of that movement. The previous update's logic is
  rescheduled with only the new update's progress applied. The difference
  between the two finishes is what progress caused, and the rest is what the
  scheduler's revisions caused;
- the driving path at the start of the window, and the activities on it that
  explain the slip. On the progress side that means work that finished late,
  started late or ran long. On the revision side it means durations, lags,
  links, constraints and calendars that were changed on the path.

The windows add up to the whole movement. A table at the end lists the
activities named in the most windows. On a real job that list is often where
a claim narrative starts.

## The bug it found in our own comparison

Building this turned up a mistake in the two-update comparison we shipped
earlier the same day. The half-step file took the new update's remaining
duration for every activity, started or not. A remaining duration on work
that has not started is not progress, though. It is a re-estimate, which is
a revision. With the old rule, a scheduler who quietly lengthened an
unstarted activity on the critical path had that slip reported as
"progress": the contractor's crews would have taken the blame for a change
to the plan.

The half-step now keeps the previous update's remaining duration on
activities that are unstarted in both files. On our invented example pair the
split moved from +6 progress / +9 revisions to +8 / +7. That is right: the
painting duration on the driving path was cut from 10 to 8 days in that
update, which is a revision, and it had been netted against the progress.

## How we checked it

No public set of consecutive real P6 updates exists that we could find, so
we made them. Each of six public XER files (P6 5.0 to 24.12, up to 14,270
open activities) became the first update of a five-update series, statused
"as planned" 20 working days at a time. We planted known delays: a slip on
driving-path work in window 2, a lag or duration revision on the path in
window 3, and both in window 4.

Over 36 series and 144 windows, every split matched the expected one
exactly, and every as-planned window moved 0 with nothing named. In all 86
windows that carried a planted change, the planted activity or link was named
among that window's drivers, and in every series the windows added up to the
whole movement. The updates were handed over shuffled and came back in
data-date order every time. The 14,270-activity file takes about 9 seconds
for a five-update series in Node.

The planted number of days is not always the number the finish moves by. An
SS link off the slipped activity, a successor on a five-day calendar after a
seven-day one, or a constraint all change the effect. So the check measures
the expected split from counterfactual files, the same window built with and
without its revision, rather than taking the typed number on trust. The full
method and per-file table are in
[`eval/windows-check-2026-11-19.md`](../../ventures/xer-schedule-check/eval/windows-check-2026-11-19.md).

## What it doesn't do

It names candidates. It doesn't decide who is responsible for a delay, which
is the analyst's job and often the subject of the dispute. The split uses this
tool's CPM engine, which reproduces P6's stored dates on 99.99% of activities
in the same six files. It is still not P6, and a forensic report should be
checked in P6 before anyone relies on it. The check above also uses
generated updates, not a real job's, so the next step is a real series of
updates. If you have one you can share, even anonymised, it would tell us
more than another thousand planted delays.

The tool is free, runs in your browser, and never uploads the schedule:
[marisstella.app/xer-schedule-check](https://marisstella.app/xer-schedule-check/).
