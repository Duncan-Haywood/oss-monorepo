---
title: "Asking for dates a building model already holds: a date range from every value"
seo_title: "IDS date ranges from a model: earliest and latest of every value"
date: 2026-11-17
tags: [ids-model-check, bim, ifc, ids]
description: "The IDS editor now offers the range a model's dates span. With 600 doors, the earliest date was not among the 50 values on screen."
---

An Information Delivery Specification (IDS) is a file that says what a
building model must contain: every door has a fire rating, every wall's
length is between this and that. Our [IDS editor](https://marisstella.app/ids-model-check/editor.html)
can open the model you are writing the specification for and offer what that
model already holds. For a number, one click turns the values into a range
the model passes. Until today that click worked only on numbers.

Dates matter in handover: a warranty start, an inspection date, a
maintenance interval written as a duration. Earlier today the editor learned
to write date and duration ranges at all
([date ranges, and where IfcTester parts](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/date-ranges-2026-11-17.md)).
What it still did not do was tell you which range the model spans.

## The list on screen was not enough

The editor lists the 50 commonest values a property holds. Most dates are
unique, one per door, so on a model with 600 doors the list showed 50 of 600
dates, sorted by count and then by text. The earliest warranty start in our
test model, 2021-08-13, happened to be first. The latest, 2026-12-30, was not
on screen at all. Typing a range from the visible values would have failed
the doors whose dates were not shown.

So the model inventory now keeps the earliest and latest of **every** value,
in the order the checker uses for range bounds, separately from the list it
shows. The rules:

- **One form only.** If every value is an ISO date (or every one a date-time,
  a time, or a duration), the range is kept. One door with `TBC` typed into
  its date gets no range, because no range would pass that door. The note
  says so instead of offering a range that fails the model.
- **Merged across classes.** A specification on doors and windows takes the
  earliest and latest over both.
- **No rounding.** Number ranges are widened slightly because unit
  conversion leaves 0.254 m as 0.25399999999999995. Dates are compared
  exactly, so the bounds are the model's own values.

## What we checked

On the sample house plus 600 generated doors, the inventory's earliest and
latest dates match those read straight from the file. In Chromium, a script
opens an IDS, opens the model, and clicks **Use the model's range** on a date
row and a duration row. It downloads the IDS and checks it against the
model: every door passes, and a door moved one day past the latest fails.
Then it clicks **Write as a pattern**, the rewrite the page offers because
IfcOpenShell's IfcTester fails every object on a date range. The pattern gives
the same two verdicts.

## What we could not check

None of the public models we test with holds a date. The HHS Office and
Schultz Residence exports are IFC2X3, which has no date type, and none of
their text properties holds a date-shaped value. buildingSMART's sample
scenes and xBIM's test files have none either. A real IFC4 export with
handover dates is the next test. If you have one you can share, the
[checker](https://marisstella.app/ids-model-check/) runs in your browser and
uploads nothing.

Details and every number: [`eval/model-date-range-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/model-date-range-2026-11-17.md).
