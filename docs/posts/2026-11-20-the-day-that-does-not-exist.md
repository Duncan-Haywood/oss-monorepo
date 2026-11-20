---
title: "April 31st passed our date check. A revision diff found it"
date: 2026-11-20
tags: [ids-model-check, ventures]
description: "Grading date-range edits in an IDS revision exactly meant reading what the checker passes, string by string. It turned up days that do not exist passing."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) compares two
versions of an Information Delivery Specification and says, for each change,
whether the new file asks more of the model or less. Patterns were graded
exactly last week. Date ranges were not: moving "warranty starts on or after
2024-01-01" to "on or after 2024-06-01" read as "different", which tells a
coordinator nothing.

To grade a date range against a pattern, a list of dates or another range, it
has to become the exact set of strings the checker lets through. Writing that
set out found two things.

**Days that do not exist passed.** The checker turned each date into an
instant with JavaScript's `Date.parse`, which quietly rolls `2024-04-31`
into 1 May. So `2024-04-31` passed "on or after 2024-05-01". XML Schema, which
IDS builds on, says there is no such date. Now a day the month lacks passes no
range, leap years included. buildingSMART's 334 test cases still score 334 of
334.

**Time zones make "up to the 29th" and "before the 1st" different
requirements.** The checker compares instants, so `2024-02-29-00:01`, a
minute after midnight UTC on the 29th, fails "on or before 2024-02-29" and
passes "before 2024-03-01". The diff now says the second asks less, and names
that value.

The set itself is simple once written down. Days are whole and a zone offset
is under a day, so each bound becomes a range of written days that shifts by
one depending on whether the zone is east or west of UTC. Each of those is a
fixed-width range of digits, intersected with the calendar. The result is an
ordinary regular language, so the same automata that compare patterns compare
date ranges, and every graded change comes with the shortest value that
passed before and fails now.

On the 31 date, time and duration ranges in the public IDS files we test
against, the language and the checker agree on 574 of 574 strings near the
bounds. Of 236 pairs of ranges on the same form, 132 that used to read
"different" now grade as asking more or less. The other 104 really overlap
only in part. All 94 example values hold when run through the checker.
Method and numbers: `eval/date-range-revisions-2026-11-20.md` in the
venture's folder.

What is still open: no public IDS revision edits a date range yet, so the
tally on real revision history is unchanged. A client's stage-to-stage pair
would show it.
