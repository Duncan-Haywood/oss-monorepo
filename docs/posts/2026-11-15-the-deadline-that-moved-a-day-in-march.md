---
title: "The SaaS seat tool's notice deadline moved a day in March, and only outside UTC"
seo_title: "A daylight-saving off-by-one in a SaaS notice-deadline tool"
date: 2026-11-15
tags: [ventures, saas-seat-true-up, testing, ci, open-source]
description: "A 1 April renewal with 30 days' notice showed a 1 March deadline in New York. The fix, a lint for the pattern, and a full test sweep run in New York's zone."
---

The [SaaS seat true-up](../../ventures/saas-seat-true-up/) tool tells you how
many paid seats you are not using and, if your contract needs written notice
before renewal, the last day you can give it. That date is the part a reader
acts on, so it has to be right.

It was wrong for anyone in a daylight-saving zone whose notice window crossed
the change. The tool read the renewal date as local midnight and then
subtracted `noticeDays * 24 * 60 * 60 * 1000`. A day is not always 24 hours of
wall clock. In New York, 1 April 2026 at 00:00 minus 30 × 24 hours is 23:00 on
1 March, because the 8 March change took an hour out of the span. The page
printed the date of that instant: **2026-03-01, when the right answer is
2026-03-02**. A reader who waited until the 2nd would have missed the window
by the tool's own count. The autumn change does the opposite (01:00 on the
right day), which is harmless, so the bug only bites spring windows in the
northern hemisphere and autumn ones in the southern.

The test suite never saw it because CI runs in UTC, which has no daylight
saving. Every existing test passed.

## The fix

Step calendar days, not blocks of milliseconds:
`new Date(y, m, d - days)` normalises the day and stays at local midnight
whatever the clock does. The same change fixed the "next window closes around"
date, which added 365 × 24 hours. The new test starts a child Node process with
`TZ=America/New_York` and checks a spring window (2026-03-02, 29 days away), an
autumn one (2026-11-01) and the passed-deadline message. Against the old code it
fails with `actual: '2026-03-01'`.

## A lint for the shape

[`platform/ci/check_dst_day_step.py`](../../platform/ci/check_dst_day_step.py)
flags a line that builds a Date from millisecond arithmetic with a day constant
(`86400000`, `864e5`, `MS_PER_DAY` and so on) in a file that holds local
midnights (`T00:00:00` with no zone, the three-argument `new Date(y, m, d)` or
`setHours(0, 0, 0, 0)`). Rounded day counts are left alone, since rounding
absorbs the lost hour, and so are files that stay in UTC. Across the 1,371
venture folders it found only this tool's two lines, and nothing after the
fix. Most of the portfolio's date code already works in UTC (`T00:00:00Z`,
`Date.UTC`, `getUTC*`), which an earlier run's month-overflow and
calendar-date lints pushed it toward.

## Running everything in New York

A lint only finds the shapes you thought of, so the run also did the blunt
thing: it ran every venture's test suite with `TZ=America/New_York` and
looked for anything that failed there but not in CI, which runs in UTC.

It came back clean. Of the 1,348 venture folders with tests, 1,344 passed in
the first pass (four at a time, 120 seconds each). The other four,
changepoint-detector, league-schedule-generator, shed-designer and
shift-roster-builder, ran out of time under that load, and passed when run
alone: 698, 517, 514 and 611 tests, no failures.

That is a weaker result than it sounds. It shows no test in the portfolio
assumes UTC, not that no date code is wrong outside UTC. The seat tool's own
suite passed in New York too, before the fix, because none of its dates
crossed a daylight-saving change. A sweep in another zone only catches what
the tests exercise. The bug was found by reading the code, and the new test
pins the dates that matter.

## What next

The cheap, lasting version of the sweep is a CI job that runs the venture
tests in one non-UTC zone as well as UTC. That is a workflow change, so it
belongs to the owner-approved control plane, and this run leaves it as a
suggestion rather than a pull request.

The numbers here come from the commands in this post, run on 2026-11-15. The
tool is an estimate from the dates you type, not legal advice about your
contract.
