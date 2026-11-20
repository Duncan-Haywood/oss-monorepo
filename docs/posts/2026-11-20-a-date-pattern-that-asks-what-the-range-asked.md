---
title: "A date pattern that asks what the date range asked"
date: 2026-11-20
tags: [ids-model-check, ventures]
description: "IfcTester fails every object on an IDS date range, so the editor rewrites it as a pattern. The old pattern passed 2024-02-30. The new one is exact."
---

IDS 1.0 lets a requirement say "the warranty starts on or after 1 January
2024" as a date range. IfcOpenShell's IfcTester 0.9.0, the checker most
teams run, turns each range bound into a floating-point number. That fails
for `2024-01-01`, so IfcTester fails every object on any date range
([we measured it](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/date-ranges-2026-11-17.md)).
The [IDS editor](https://marisstella.app/ids-model-check/editor.html) works
around it with a button, **Write as a pattern**. It rewrites the range as an
XSD pattern that both IfcTester and our checker read the same way.

The pattern was a shape, though, not the same requirement. It came from
comparing the date strings digit by digit, so:

- `2024-02-30` and `2023-02-29` matched. Those days don't exist, and the range
  refuses them.
- It used `\d`, which in XSD means any Unicode digit, so `٢٠٢٤-05-01`
  (Arabic-Indic digits) passed "on or after 2024".
- It ignored time zones. `2024-05-01+01:00` begins at 23:00 UTC on 30 April,
  so the range says it is not on or after 1 May. The pattern let it through,
  along with `+24:00`, which isn't a valid time zone at all.

None of this is common in a real model. But a requirement that changes
meaning when you press a button is a bad requirement, and the contract
appendix printed from that IDS would say something the checker doesn't.

## What the button writes now

The pattern spells out the calendar. Every month has its own day count, and
29 February appears only for leap years, which are written by century,
decade and digit so an open range like "from 2024" stays near 1.2 kB.
Digits are ASCII `[0-9]`. Each time-zone sign gets its own span of days,
placed the way the range check places it. A day written east of UTC needs
one day more to clear a lower bound, and a day written west needs one day
less to stay under an upper bound. Whitespace the range would ignore is
allowed around the value.

We tested it on 31 doors whose start dates sit exactly on those
differences, against 10 ranges:

| | old pattern | new pattern |
|---|---|---|
| door verdicts that differ from the range | 50 of 310 | 0 of 310 |
| same failing doors as IfcTester 0.9.0 | 10 of 10 | 10 of 10 |

The old pattern agreed with IfcTester but not with the requirement it
replaced. The new one agrees with both. The unit tests check it against our
checker's range reading on more than 50,000 date-and-zone strings, and
against the calendar on more than 200,000 more across years 0000 to 9999.
The method and the raw output are in
[`eval/date-pattern-exact-2026-11-20.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/date-pattern-exact-2026-11-20.md).

The revision diff, which grades how one IDS revision changes another, now
reads date ranges through this same pattern. A date range and the pattern
the editor wrote for it now come out as "same" in the diff, because they
ask for the same dates.

Still open: patterns for dateTime ranges. Fractional seconds give dateTimes
variable length, so for now the editor offers no pattern for them.
