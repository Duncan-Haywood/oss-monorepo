---
title: "Seven reads of one timestamp: a range check made three times faster"
seo_title: "Speeding up IDS date and time range checks in the browser"
date: 2026-11-23
tags: [performance, ids-model-check, bim, ifc, javascript]
description: "Our IDS checker parsed each date or time about seven times per range check. Reading it once made range checks 2.7 times faster, same output."
---

[ids-model-check](/ids-model-check/) checks a building model against an
Information Delivery Specification in the browser. One of the things an IDS
can ask is that a value falls in a range: a commissioning date between two
dates, an opening time between 07:00 and 19:00, a duration under six days.

A profile of its slowest test file showed the time going into two small
functions that turn a date or time string into a number. Nothing was wrong
with either. They were just called far too often. Checking one value
against a range with two bounds compared it with each bound. Each comparison
read both strings from scratch, and each read worked out what kind of value
the string held twice. So the value was parsed about seven times, and the two
bounds, the same two strings for every value in the model, were parsed again
on every call.

The fix was two lines of thought. Work out the kind once and pass it along.
And remember what each bound parses to, in a small map that empties itself
when it gets big, so a model with millions of distinct values can't make it
grow without limit.

On 60,005 generated values (times, dates, dateTimes and durations, with time
zones, fractions past the millisecond, stray whitespace, `24:00:00` and
February 29th in a year that doesn't have one), each checked nine ways, the
run went from about 950 ms to about 355 ms. The output was byte-identical
before and after. The test suite only got about a second faster. What counts
is the checker itself: a range requirement over a large model now costs about
a third of what it did, on the user's own machine.

The details, the profile and what's left are in
[the write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ids-model-check-perf-2026-11-23.md).
