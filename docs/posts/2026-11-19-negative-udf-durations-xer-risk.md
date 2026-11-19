---
title: "A pessimistic duration of minus five days: what a red-team run found in the XER risk analysis"
seo_title: "Negative P6 UDF durations in a Monte Carlo schedule risk run"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer, red-team, testing]
description: "Seeding 20 faults into XER Schedule Check's new UDF ranges and risk code: 16 caught, four test gaps closed, and one real bug that let negative durations shorten the forecast."
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

The tool is free and runs in the browser. Results are estimates from typed
assumptions, not professional scheduling or legal advice.
