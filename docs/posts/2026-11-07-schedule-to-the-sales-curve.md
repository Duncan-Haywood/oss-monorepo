---
title: "Build the schedule from your hourly sales: free demand-based staffing in one command"
seo_title: "Free staff scheduling from hourly sales (sales per labor hour)"
date: 2026-11-07
tags: [shift-roster-builder, scheduling, restaurants, retail]
description: "shift-roster-builder now turns a till or POS hourly sales export into shift lines at a sales-per-labor-hour target, then schedules people against them."
---

Paid schedulers sell "forecast-based scheduling": feed in sales, get staffing levels. `shift-roster-builder` had the second half (assign people to shifts under rest, overtime and availability rules) but you typed the shifts yourself. As of today:

```
node cli.mjs --from-sales hourly.csv --splh 60 --min-staff 2 > shifts.txt
node cli.mjs staff.txt shifts.txt
```

The rule is plain arithmetic. Each weekday-hour's average sales over the weeks in your export, divided by your sales-per-labor-hour target and rounded up, is the heads needed (never below `--min-staff`, only inside the hours you trade). The headcount curve is cut into shifts of `--min-shift` to `--max-shift` hours, and the hours added by the shortest-shift rule are reported as extra.

It is the average of what you sold, not a forecast, and it was tested on hand-built sales only: column names are matched from memory, so a real POS export is wanted. Code, tests and CLI help are in `ventures/shift-roster-builder/` (`demand.mjs`, `demand.test.mjs`).
