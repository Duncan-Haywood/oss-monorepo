---
title: "245 XER files that P6 did not write: one crash, 28 NaNs, and a six-day week read as five"
seo_title: "XER files from converters and other tools: what broke"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer]
description: "Every public .xer a GitHub search returns, run through XER Schedule Check: what broke on converter and hand-made files, and what each fix changed."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser, runs the DCMA 14-point assessment, and recomputes
the schedule. On six real P6 exports it matches the dates P6 stored on 19,820
of 19,822 open activities. But plenty of XER files were never written by P6.
Converters make them (MPXJ, Aspose, GroupDocs), other schedulers export them,
and people type them by hand for tests and demos. A reviewer handed one of those
should get a report that reads properly, not an error.

So today every public `.xer` a GitHub code search for `ERMHDR` returned went
through the full assessment: 245 distinct files from 50 repositories.

## What broke

| | before | after |
|---|---|---|
| assessed | 240 | 241 |
| crashed | 1 | 0 |
| files printing NaN, undefined or Infinity | 28 | 0 |
| warnings, all files | 890 | 134 |

- **A lag of `NotANumber`** read as NaN. `?? 0` lets NaN through, and adding
  NaN hours of work to a date ran until a 1,000-year guard gave up. Any number
  field that does not read as a finite number ("NaN", "inf", "1e999999", text)
  now counts as blank, and the report names the activities or links it came from.
- **Activities with no calendar** printed "calendar undefined not in the file",
  one line per activity (179 in one file), and borrowed the file's first
  calendar, which was sometimes a 24-hour one. They now take their project's
  calendar, and the warning is one line.
- **"Standard 6 Day Week" read as Monday to Friday.** A calendar with no
  stored work pattern was always assumed to be a five-day week. Its own fields
  said otherwise: 8 hours a day, 48 a week. When that ratio is exactly 6 or 7,
  the tool now uses six or seven days and says so. Anything less tidy (42 over
  8) stays five days.
- **"float NaN h"** where a file stored dates but no float. It now says "not stored".
- **Four files are not schedules at all** (parser tests with a `Task_ID`
  column and no PROJECT table). They are refused in one line with the reason,
  not a stack trace.

## What it did not change

The six real P6 files still match 19,820 of 19,822. None of the 245 files adds a
seventh real P6 export: 207 store no dates, and the rest have dates that were
typed or generated, so there is nothing to score accuracy against. MPXJ's
fixtures for the four lag-calendar settings each hold a single finished
activity, so they show the setting is read but exercise no lag.

The check is a script now: `node eval/converter-corpus.mjs <dir> --fetch
eval/converter-corpus-2026-11-19.txt` fetches the list and prints the counts.
Details are in `eval/converter-files-2026-11-19.md`.
