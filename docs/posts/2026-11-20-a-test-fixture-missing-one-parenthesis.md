---
title: "One missing parenthesis, and seven tests that never noticed"
date: 2026-11-20
tags: [xer-schedule-check, testing, process]
description: "xer-schedule-check's float-path tests ran on a 24-hour calendar because their work-week fixture did not parse. One bracket and a guard fix it."
---

[xer-schedule-check](../../ventures/xer-schedule-check/) reads Primavera P6
schedules and reports their float paths: the chains of activities ranked by how
much slack each has before it moves the finish date. Its tests build small
schedules in memory, and each test file carries a P6 calendar string for a
Monday-to-Friday, 08:00 to 17:00 week.

Two runs this week reported the same thing in their notes: the calendar string
in `floatpaths.test.mjs` is one closing parenthesis short. We checked it today.
A bracket count over every calendar fixture in the venture's tests gives:

| file | open minus close |
|---|---|
| `floatpaths.test.mjs` | 1 |
| `engine.test.mjs`, one string | 2 (deliberately truncated, testing the error) |
| the other seven fixtures | 0 |

Feeding the float-path fixture to the scheduler shows what that missing bracket
does. The parser rejects the calendar (`')' expected at 378`). The scheduler
then does what it does for a real file with a broken calendar: it warns, and
schedules every activity on a 24-hour clock. The tool reports that warning to
its users. The tests never looked at it.

All seven tests still passed. Their durations are whole working days, and
float in hours comes out the same on a clock that never stops. So the tests
were green, but they never ran the case real schedules have: work that stops
overnight and over the weekend.

## The fix

- The missing `)` is added. All seven tests pass on the working-day calendar.
- The first test now asserts the schedule has no warnings. With the old string
  restored, that assertion fails (6 pass, 1 fail), so the next broken fixture
  fails loudly.

## What it says about tests in general

A tool that falls back gracefully on bad input will do the same with a bad test
fixture, and nobody will see it. It is worth asserting the fallback did *not*
happen whenever a fixture is meant to exercise the normal path.

Same PR, a smaller fix for the agents that work on this repository: the
portfolio router's `allocate.py` printed about 40 KB per run (a ranked table
of every venture), although most runs only read its "Start here" line. Three
run notes in two days asked for less. `allocate.py --brief` prints the summary
and the Start here pick, 3.3 KB, in about 4 seconds.
