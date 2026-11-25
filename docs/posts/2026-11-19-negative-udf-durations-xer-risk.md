---
title: "A pessimistic duration of minus five days: what a red-team run found in the XER risk analysis"
seo_title: "Negative P6 UDF durations in a Monte Carlo schedule risk run"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer, redteam, testing]
description: "36 faults seeded into XER Schedule Check over two red-team runs, test gaps closed, and two bugs where a negative P6 duration pulled the finish in."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) gained a feature
yesterday: its schedule risk analysis can read each activity's optimistic,
most likely and pessimistic durations from the P6 user-defined fields a
schedule already carries ("Optimistic Duration", "Min Dur", "BC %" and so
on), instead of assuming one range for every activity. New code that reads
fields people type by hand is a good place to look for trouble, so today's
red-team run aimed there.

## Seeded faults: 16 of 20 caught

The red-team tool changes one line at a time (an `||` into `&&`, a `-` into
`+`, a constant off by one), runs the venture's tests and puts the line back.
Ten faults went into `udf-ranges.mjs` and ten into `risk.mjs`. The tests
caught 16. The four that got through each showed a real hole:

- counting a field's values with blanks included, so a field holding nothing
  but empty cells could be picked as the optimistic one;
- dropping the most-likely field a user named on the command line;
- a histogram whose bins all collapsed into the last one when the earliest
  finish was not day zero (no test looked past the total count);
- the "without risk events" column's chance of meeting the must-finish date
  scaled by 1.001, which nothing read.

Each now has a test that fails with the fault and passes without it: 20 of 20.

## A real bug: negative work

Pasted ranges (`code,min,likely,max`) already refused a negative minimum.
Ranges read from UDFs did not: the risk run checked only that the three
points were in order. A UDF row of -20 / -10 / -5 days is in order, so it was
drawn as negative work. On a small test schedule with a 6-day CPM finish,
that one activity pulled every percentile from P10 to P90 to 1 working day,
and the report gave no warning.

A typo, a sign convention from another tool, or a "variance" field misread as
a duration is enough to put a negative number there. The fix sits where every
range source meets, so it covers pasted, UDF and any future source alike: a
range with a negative point falls back to the default range, and the warnings
box names the activity and says a point is negative or out of order.

## A week later: the same bug in the schedule itself (2026-11-25)

The risk ranges were guarded; the scheduling engine was not. A second
red-team run seeded 16 faults into the critical path engine (`cpm.mjs`) and
the windows delay analysis (`windows.mjs`). The tests caught 9; one more
could not change a result (a minimum taking a value equal to the one it
already had). The six that got through were holes in the tests, not bugs in
the shipped code: had one of these lines been broken, nothing would have
noticed. Each is now pinned by a test:

- an activity that waits only because it follows a logic loop must not be
  reported as a loop of its own;
- a critical path test delay on an activity with a P6 expected finish must
  go on top of the expected finish, not come off it;
- a one-day slip on work under way on the driving path must be named as a
  window's driver;
- the "holds no project with ID" warning must stay quiet on a clean series
  and fire once per update when the ID is wrong;
- the warning that the windows do not add up when the project calendar
  changes between updates was never exercised.

Then the hunt for real bugs: a remaining duration of -80 hours on a driving
activity. The engine scheduled it to finish two weeks before it started, pulled
the project finish in by 17 days and said nothing. Text in the same field
("abc") already got a warning and was read as 0. P6 does not let you enter a
negative duration, but a hand-edited file or one converted from another tool
can carry one. Remaining and original durations below zero are now read as 0,
and the warnings name each activity, the same way unreadable values are
named. A negative lag is a lead, which P6 allows, so it still stands.

The tool is free and runs in the browser. Results are estimates from typed
assumptions, not professional scheduling or legal advice.
