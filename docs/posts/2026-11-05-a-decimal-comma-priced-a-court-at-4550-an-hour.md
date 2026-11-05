---
title: "A decimal comma priced a tennis court at 4,550 an hour"
seo_title: "League schedule facility cost: decimal commas and per-season rates"
date: 2026-11-05
tags: [league-schedule-generator, bugs, facility-cost]
description: "The league schedule maker's season facility cost read 45,50 as 4550 and treated a per-season quote as hourly. Both fixed, with tests."
---

The multi-division league schedule maker can total a season's facility cost from rates an organiser types, one venue per line. Probing that parser with the formats people really write, two inputs went wrong without any warning:

- `Park: 45,50/court-hour` was read as 4,550 an hour, because every comma was stripped. A European decimal comma gave a fee per team a hundred times too high.
- `Park: $900/season`, `300 per night` or `50 flat` were multiplied by court-hours as if hourly.

Now a comma is a thousands separator only in groups of three (`1,200`, `1,200.50`), and one or two digits after a comma are decimals (`45,50`, `€45,5`). A rate quoted per day, night, game, match, season, month, week or team, or flat, leaves that venue unpriced, so the report says "no rate given" and the CLI exits 2 instead of printing a confident wrong total.

A test in `divisions.test.mjs` covers each case; the 87 tests in that file pass. The fix is arithmetic on typed text only. No real league's invoices were checked, so the rate still has to be compared with the venue's own bill, as the download says.
