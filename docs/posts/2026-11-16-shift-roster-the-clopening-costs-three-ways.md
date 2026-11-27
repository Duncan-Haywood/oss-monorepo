---
title: "One close-then-open, three prices: Seattle, Los Angeles and Philadelphia"
seo_title: "Clopening pay compared: Seattle, Los Angeles, Philadelphia"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, fair-workweek, predictive-scheduling]
description: "The same 8-hour rest between a close and an open costs $20, $80 or a flat $40 depending on the city. The team hub now prices all three."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

Take one worker at $20 an hour who closes Sunday at midnight and opens Monday
at 08:00 for an eight-hour shift. That is eight hours of rest. Every city with a
fair-workweek law treats it as a short rest. They do not agree on what it costs.

- **Seattle** (and Oregon): 10 hours of rest. The two hours of Monday's shift that
  fall inside that window are paid at time and a half: 0.5 × 2 h × $20 = **$20**.
- **City of Los Angeles** (large retail): also 10 hours, but the city's guidance
  pays time and a half "for the Shift following the insufficient rest period",
  the whole shift: 0.5 × 8 h × $20 = **$80**.
- **Philadelphia** (retail, hospitality and food service): 9 hours of rest after
  a prior day's shift. The worker must agree in writing, and gets **$40** for
  that shift whatever their wage. A same-day split shift with a gap in the middle
  is not counted at all.

A close-then-open that Seattle prices at $20 costs four times that in Los Angeles.
In Philadelphia the cost does not depend on the wage.

## What changed in the tool

The [Shift Roster Builder](../../ventures/shift-roster-builder/)'s self-hosted
team hub already logged every change to a posted week and priced it under
Seattle, Oregon or Chicago numbers. It now has two more presets,
`FAIR_WORKWEEK=philadelphia` and `FAIR_WORKWEEK=los-angeles`. Their other rules
differ too:

| | Philadelphia | Los Angeles (city) |
|---|---|---|
| Free changes | start or end moved by 20 min or less | added work of 15 min or less |
| Hours taken away | half their pay | half their pay |
| A call-out offered to the whole team | exempt | still owes the hour |

Three switches carry the rest rules: a flat sum per short rest, the multiplier on
the whole shift, and counting only rests after a prior day's shift. They work on
any preset, so a city that isn't listed yet can be typed in. The 17 tests in
`notice.test.mjs` include the example above, priced under all three cities.

## How sure are these numbers?

Less sure than the Oregon preset, which was read from the statute itself.
phila.gov and the Los Angeles wage office's site could not be reached from the
session that built this. The numbers come from search summaries of the cities'
FAQs and regulations and from law-firm alerts, used only where two of them agreed.
Where sources disagreed (whole shift or only the hours in the gap for Los
Angeles), the
[README](../../ventures/shift-roster-builder/README.md) says which reading was
picked and why. The changes page says the same: it is an estimate to check
against Phila. Code ch. 9-4600 and LAMC ch. XVIII art. 5 before payroll, not
legal advice.
