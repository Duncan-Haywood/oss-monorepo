---
title: "Switching schedulers: turn last month's published schedule into the shifts to cover"
seo_title: "Switching schedulers: turn last month's schedule into shifts"
date: 2026-10-30
tags: [shift-roster-builder, scheduling, import]
description: "The shift roster builder now reads a published-schedule CSV and writes the shift-requirement lines, counting people per weekday, time and position."
---

People leave paid schedulers because of the per-seat price, then face retyping every shift. The [shift roster builder](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/) already imported a staff export. It now imports the shifts too: one row per scheduled shift (date or a datetime, start, end, position) becomes lines like `Mon, 7:00, 15:00, 2, , server`.

**How it counts.** Rows are grouped by weekday, start, end and position. If the file spans several weeks, the busiest week sets the number of people needed for each shift, so a holiday week does not shrink the need. Employee names are ignored, because the tool assigns people itself. Dates parse as ISO or US `m/d/y`, with day-first when the first part is above 12.

**Limits.** A published schedule shows who was scheduled, not who was needed, so the page tells you to check the counts. The column names were written from memory and tested on invented layouts only, not on a real 7shifts, When I Work or Homebase export. `node cli.mjs --import-shifts schedule.csv` does the same from the command line.
