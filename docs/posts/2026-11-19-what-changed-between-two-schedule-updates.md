---
title: "What changed between two schedule updates: a free P6 XER comparison with a half-step split"
seo_title: "Compare two P6 XER updates free, with a half-step split"
date: 2026-11-19
tags: [construction, scheduling, xer-schedule-check]
description: "XER Schedule Check now compares last month's P6 update with this month's: progress claimed, edited actuals, logic changes, float used and a half-step split."
---

Every month a contractor sends the owner a schedule update with the pay
application, and someone on the owner's side has to decide whether the progress
claimed is real and whether the finish moved because of work done or because
the schedule was quietly rewritten. The tools that answer that properly are
licensed per seat; most people do it by opening two exports side by side.

[XER Schedule Check](https://marisstella.app/xer-schedule-check/) now does it in
the browser. Open this month's `.xer`, then last month's, and the page lists:

- **Progress**: what started and finished, how late against last month's
  forecast, and what was forecast to happen by the new data date and did not.
- **Things a reviewer asks about first**: actual dates edited after they were
  reported, actual dates past the data date, progress that went backwards,
  logic deleted on the critical path, original durations cut on critical work.
- **Revisions**: relationships added, deleted, retyped or re-lagged; durations,
  constraints and calendars changed; activities added, deleted or renamed.
- **Float and the critical path**: float used per activity, what became
  critical, what joined or left the driving path and how far each finish on it
  moved.
- **A half-step run**: last month's logic and durations with only this month's
  progress applied, recomputed. On the built-in example the finish moved 15
  working days: 6 from progress, 9 from revisions. That is the split a delay
  analyst draws in a windows analysis (AACE RP 29R-03 calls it a bifurcated
  update, MIP 3.4).

## How it was checked

There is no public pair of consecutive real P6 updates that we could find (the
pairs on GitHub are tools' own hand-written demos), so the check plants edits.
Six real XER exports from P6 5.0 to 24.12 were each compared with themselves
(no change reported on any) and with 20 copies carrying six random edits of
nine kinds. **All 720 planted edits were reported, and nothing that was not
planted.** The half-step uses the tool's own scheduling engine, which matches
the dates P6 stored on 91.5% of 19,822 activities; the split has not yet been
checked against a real pair of updates, and the page says it is computed by
this tool, not by P6.

The method and every number are in the venture's
[`eval/compare-check-2026-11-19.md`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/xer-schedule-check/eval).
The same comparison runs from a terminal:
`node cli.mjs this-month.xer --previous last-month.xer --csv changes.csv`.

It is a screening aid, not a delay analysis or contractual advice; nothing is
uploaded, and it is MIT licensed.
