---
title: "Working hours in an IDS: time ranges IfcTester can read, and what 24:00:00 means"
seo_title: "IDS time ranges as patterns IfcTester can read"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "IfcTester fails every object on an IDS time range. The free IDS editor now rewrites one as an exact pattern, and reads a time of 24:00:00 as midnight."
---

IDS 1.0 lets a requirement say that a time must fall in a range: a work
schedule's `Pset_WorkControlCommon.WorkStartTime` (an `IFCTIME`) between
07:00 and 17:00, written on `xs:time`. [IDS Model
Check](https://marisstella.app/ids-model-check/) reads that range as one.
IfcOpenShell's IfcTester 0.9.0 does not: it turns every range bound into a
float, and `float("07:00:00")` fails, so every object fails. On 32 test
schedules it failed all 32 on each of 10 time ranges.

The editor already offered a way round this for dates and date-times:
**Write as a pattern** rewrites the range as an XSD pattern that passes the
same values, which both checkers read the same way. As of today it does the
same for times.

## What the pattern has to get right

A time range sounds simple until time zones come in. The checker places a
time on a fixed day and compares instants, as XSD 1.1 does, so
`03:00:00+05:00` is 22:00 UTC on the day before and fails "from 00:00:00".
The pattern writes, for each UTC offset that real time zones have used since
2000 (44 of them), the clock times whose instant lands inside the range,
down to the digits past the millisecond that .NET exporters write. Over
100,000 strings near each bound, in every one of those zones, the pattern and
the range gave the same answer every time. On the 32 schedules, 0 of 300
verdicts differed, and IfcTester on the pattern failed the same schedules as
this checker on the range, 10 specifications out of 10.

The one place they part: an offset no zone uses, such as `+10:17`. Writing
every possible offset would make the pattern thousands of alternatives
longer, so near a bound those values are refused. The pattern never passes a
value the range refuses.

## A bug found on the way: 24:00:00

XSD allows `24:00:00` as a time and says it means `00:00:00`. The checker
read times by placing them on 1 January 1970 and parsing the result, which
turned `24:00:00` into midnight on the 2nd. Such a time then passed no range
of times of day, not even "00:00 to 01:00". It now reads as `00:00:00`. A
date-time's `24:00:00` is still the next day's midnight, as XSD says.

## Where this stands

None of the 65 real IDS files we collect from public repositories uses a time
range yet. buildingSMART's own test file `RichFile.ids` has four, and each
gets a pattern. So this is ready for the first client who asks for working
hours, not a fix for a file someone already wrote. Durations are still
missing: a duration range counts a month as 30.44 days, which no pattern can
follow.

The measurements and the scripts that produced them are in
[`eval/time-pattern-2026-11-21.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/time-pattern-2026-11-21.md).
The checker gives estimates, not professional advice. Check a requirement
with the people who will be held to it.
