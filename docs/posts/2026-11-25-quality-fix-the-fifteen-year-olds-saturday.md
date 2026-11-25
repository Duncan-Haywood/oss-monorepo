---
title: "Quality fix: a 15-year-old's Saturday shift, and the 9pm that only applies in summer"
seo_title: "Scheduling 14-15 year olds: 8 hours on Saturday, 7pm outside summer"
date: 2026-11-25
tags: [quality-audit, shift-roster-builder, for-customers, scheduling, labor-law]
description: "Shift Roster Builder now gives a 14-15 year old 8 hours on a school-week weekend, as federal law allows, and ends a non-summer break week at 7pm, not 9pm."
---

US federal law (29 CFR 570.35) lets a 14 or 15 year old work at most
3 hours on a school day and 18 hours in a school week, 8 hours on a
non-school day and 40 hours in a non-school week. They can work only from
7am to 7pm, or to 9pm from 1 June to Labor Day.

[Shift Roster Builder](../../ventures/shift-roster-builder/) has turned
those limits into hard rules when a row says `age: 15`. The
[quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-shift-roster-builder-r4.json)
(defect 1, medium) found that it applied the 3-hour cap to every day of a
school week, Saturday and Sunday included. A café with a 9am to 3pm Saturday
shift and a 15-year-old who wanted it saw the shift left open with "at their
daily hour limit". The law allows that shift. The product was stricter than
the law, so it never scheduled anyone illegally. But a manager who trusted
it lost a legal shift, and so did the teenager.

## What changed

- **Weekends get 8 hours in a school week.** Monday to Friday keeps the
  3-hour cap. Saturday and Sunday allow 8 hours, or the person's own
  `daily:` cell if that is lower. The 18-hour week is unchanged. A weekday
  school holiday still gets the 3-hour cap. The roster does not know the
  school calendar, so on that day it stays stricter than the law, never
  looser.
- **`age: 15 break` no longer runs to 9pm.** While fixing the first
  defect we found a second one the audit did not list. `break` (a non-school week)
  was treated exactly like `summer`, including the 9pm evening limit. The
  9pm limit applies only from 1 June to Labor Day (570.35(b)). So a
  15-year-old marked `break` for a December holiday week could be put on a
  shift that ran past 7pm. That breaks the federal rule. `break` now gives
  8-hour days and 40 hours but still ends at 7pm. This was the more serious
  of the two bugs, because it was the one that could schedule an illegal
  shift.
- The CLI's disclaimer used to say that "scheduling-notice ... and
  minor-labor rules are not modelled". That was wrong (audit defect 4,
  low). It now says what is checked: the named fair-workweek presets and
  the federal 14-15 limits. State and local rules are not checked.

## How it is tested

A new test in `calc.test.mjs` builds a roster for one 15-year-old with 6-hour
shifts on Saturday, Sunday and Monday. Saturday and Sunday must be covered
and Monday must stay open. A 9-hour Saturday shift must stay open. `break`
must give 8 hours, 40 hours and a 7pm end. On the code before the fix the
test fails at its second assertion (no weekend cap existed). On the fixed
code all 158 tests in the file pass.

The [guide page on scheduling 14 and 15 year olds](../../ventures/shift-roster-builder/scheduling-14-and-15-year-olds.html)
said the tool took "the cautious reading" for weekends. It now says what the
tool does, and its example table changed. That example is an invented
seven-person café with 8am to 4pm opening shifts on Saturday and Sunday. It
has a 15-year-old and a 14-year-old on staff, both in a school week. Before
the fix the two of them got **no hours at all**, with 7 shifts left open and
184 of 220 hours covered. Now each takes both weekend openings: 32 hours
between them, 3 shifts open and 216 hours covered. That is the same roster
as in summer. A test re-derives every row of that table from the engine
(`page-timeoff.test.mjs`).

## Still open

The audit's other medium defect is not fixed here. The planner's daily
overtime puts every hour of an overnight shift on the day it starts. The
product's own timesheet splits the hours at midnight. Both readings are
lawful under some workday definitions. They should agree, and the README's
Known gaps still lists it. A later audit round will re-check this fix.

State law is often stricter than the federal floor: some states require
work permits, more breaks or shorter hours. This is a planning aid, not
legal advice.
