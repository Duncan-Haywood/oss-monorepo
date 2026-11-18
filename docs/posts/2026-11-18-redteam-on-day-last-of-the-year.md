---
title: "\"On day last of the year\": two wording bugs in the RRULE explainer"
seo_title: "RRULE BYYEARDAY=-1 in plain English: the last day of the year"
date: 2026-11-18
tags: [redteam, testing, javascript, icalendar]
description: "A red-team run seeded 20 faults into the RRULE explainer's engine. 14 broke a test. Three of the six that got through were real test gaps, and reading the output turned up two wording bugs, now fixed."
---

Today's red-team run aimed at the engine of the
[RRULE explainer](https://marisstella.app/rrule-explainer/), the free tool that turns an iCalendar
recurrence rule into plain English and a list of dates. The run seeded 20 small faults into
`rrule.mjs`, one at a time, and ran the tool's own tests after each one. 14 broke a test, a catch
rate of 70%.

## The six that got through

Three could not change anything a person sees. One made `BYMONTHDAY=0` count as a "from the end"
day, but the parser already rejects 0. One changed how a line starting with `:` is split, but such
a line has no property name the tool reads. The third only mattered for a rule part with no name,
and the fix below handles that case before the changed line runs.

The other three were real gaps, and each now has a test:

- **"11st".** The ordinal helper writes 11th, 12th and 13th, not 11st, 12nd and 13rd. Changing
  `>= 11` to `>= 12` broke the 11th, and no test asked for "on the 11th of the month".
- **RDATE labels.** When an `RDATE` lands on a date the rule makes anyway, the date is listed once,
  as the rule's. A fault that relabelled it "From RDATE" got through.
- **"The rule has no end".** This note should appear only when a rule has neither `COUNT` nor
  `UNTIL`. A fault that showed it on every `COUNT` rule got through.

With those tests in, all three faults are caught. The catch rate on the faults that can change
the output went from 14 of 17 to 17 of 17.

## Two real bugs, both in the English

Rules people can type turned up two bugs in the plain-English summary. The dates were right in
both cases.

**Counting from the end of the year.** In `BYYEARDAY` and `BYWEEKNO`, a negative number counts
back from the end of the year. `BYYEARDAY=-1` is 31 December. The summary pasted an ordinal into a
sentence built for a plain number:

| Rule | Before | Now |
|---|---|---|
| `FREQ=YEARLY;BYYEARDAY=-1` | Every year on day last of the year | Every year on the last day of the year |
| `FREQ=YEARLY;BYYEARDAY=-366` | on day 366th from last of the year | on the 366th from last day of the year |
| `FREQ=YEARLY;BYYEARDAY=1,-1` | on day 1 and last of the year | on day 1 and the last day of the year |
| `FREQ=YEARLY;BYWEEKNO=-1;BYDAY=MO` | in week last of the year | in the last week of the year |

Positive lists read as before, and now take a plural: "on days 100 and 200 of the year".

**A rule part with no name.** `FREQ=DAILY;=WEEKLY` gave the error "Unknown rule part " followed by
nothing. It now says `"=WEEKLY" has no part name`.

## A guard that runs without a red-team run

Both bugs had a recognisable shape, so the fix comes with a property test,
`rrule.wording.test.mjs`. It runs every rule in the tool's python-dateutil fixture set (1,600
random rules within what RFC 5545 allows, negative values included), plus a list of hostile parts,
through the analyzer. It fails on any summary or finding title with an ordinal straight after
"day" or "week", an "11st", a JavaScript value like `undefined` leaking into the text, a doubled
space, or a blank where a name belongs. On the code before this fix it fails both of its tests: 66 of
the 1,600 fixture rules alone read "day last" or "week 2nd from last". It runs in CI with the rest of the tool's
suite, which takes about five seconds.

The red-team record is `prompts/runs/2026-11-18-session_01AcxTtGSfnznLPeceHjAU6g.json`.
