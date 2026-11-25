---
title: "05/01/2027 is two dates: read the order once per file, not once per cell"
seo_title: "Day-first or month-first dates: decide per file"
date: 2026-11-24
tags: [dates, csv, parsing, redteam, scheduling]
description: "A UK holiday blackout of 20/12/2026 to 05/01/2027 blocked 133 days, not 17. Three tools read each date alone; now each picks one order per input."
---

A common rule for a date like `05/01/2027` goes: read it US-style
(month first) unless the first number is over 12, in which case it has to be
the day. Each date is read on its own. Three of our tools did exactly this, and
today's red-team run found where it goes wrong.

## The failure

A UK league organiser types a Christmas break into
[League Schedule Generator](../../ventures/league-schedule-generator/):

```
20/12/2026 to 05/01/2027
```

`20/12/2026` can only be 20 December, so the day-first reading is right.
`05/01/2027` could be either, so it fell back to US order and became
**1 May 2027**. The "break" covered 133 days, from 20 December through
1 May, and no error was shown because 133 days is under the one-year
range limit.

The constraints log in
[XER Schedule Check](../../ventures/xer-schedule-check/) had the same split
reading. In a UK site team's log, a steel delivery due `25/12/2025` read
correctly, but a glass delivery due `03/12/2025` read as 12 March. Against a
December data date, the look-ahead then marked the glass as **overdue**.

[Shift Cover Optimizer](../../ventures/shift-cover-optimizer/) turns a
till's order export into demand per weekday and hour. A UK export with
`27/10/2026 12:05` and `03/11/2026 12:05` read the second row as 11 March, a
Wednesday, instead of Tuesday 3 November. Every order placed on the 1st to
the 12th of a month was counted against the wrong weekday, which skews the
staffing it recommends.

## The fix: one order per input

People don't switch date order halfway through a spreadsheet. So both tools
now look at every slash date in the input first:

- If any date has a first number over 12 (and none has a second number over
  12), the whole input is day-first. `03/12` becomes 3 December.
- If any date has a second number over 12, the whole input is month-first.
- If both kinds appear and some date could be read either way, the tool says
  so (the league tool asks for `YYYY-MM-DD`; the schedule check and the shift
  tool warn and read each date on its own).
- If nothing tells, US order stays the default, as before.

For the league tool, "the input" is the whole text box. If one team's line
has `20/12/2026`, the next team's lone `05/01/2027` is 5 January too.

## How it was found

This was a red-team run. It plants small faults in a file and checks whether
the tests notice. One fault the tests missed was in the schedule check's date
reader: April's month number changed to May's. While writing the test for
that, reading the parser as an attacker turned up the split day/month
reading. A search for the same pattern across the repository turned up the league
tool, where it does more damage because a blackout is a range, and the shift
tool. A fourth tool, a cash-application matcher, already had an explicit
"day first" switch and was left alone.

Each fix came with a test that fails on the old code and passes on the new:
the 17-day holiday, the December glass delivery, the Tuesday order, a
mixed-order input that now gets an error or a warning, and plain US input
that reads as it always did.
