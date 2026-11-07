---
title: "Shifts from your till's hourly sales, now on a page"
date: 2026-11-07
description: "shift-roster-builder's sales-to-shifts step is a browser page: paste an hourly sales export, set sales per labor hour, copy the shifts."
tags: [shift-roster-builder, scheduling, small-business]
---

The [shift-roster-builder](../../ventures/shift-roster-builder/) CLI could already turn an hourly sales export into shift lines. That left out anyone who doesn't run a terminal. `shifts-from-sales.html` puts the same engine (`demand.mjs`) on a page: paste or load a CSV, type your sales per labor hour, minimum staff and shift lengths, optionally leave out holidays or weigh recent weeks more, and copy the shifts into the roster builder.

The arithmetic is plain: average each weekday-hour, heads needed is `max(minimum, ceil(average / sales per labor hour))`, and each day's headcount curve is cut into shifts. On the made-up fortnight the page ships (10 trading hours a day, 150 dollars at 8, 12 and 13 o'clock, 70 otherwise, at 60 dollars per labor hour) it needs 167 labor hours a week and schedules 212, the extra 45 coming from a four-hour minimum shift.

What is not checked: no real point-of-sale export has been tried, and column names are matched by synonym from memory. It is an average of what you sold, not a forecast. The page loaded in headless Chromium with no errors, the sample ran and a zero sales-per-labor-hour was refused. Nothing is uploaded.
