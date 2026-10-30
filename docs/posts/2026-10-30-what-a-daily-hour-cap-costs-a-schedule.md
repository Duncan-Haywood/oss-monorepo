---
title: "What a daily hour cap and a days-in-a-row limit cost a cafe schedule"
date: 2026-10-30
tags: [shift-roster-builder, scheduling, measurement]
description: "On the roster builder's invented seven-person cafe, a 9-hour daily cap leaves one more shift open, and a 6-hour cap is a typo that empties 27 of 32."
---

Scheduling policies nearly always include a most-hours-per-day cap and a most-days-in-a-row limit. We ran both through the [shift roster builder](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/) on its built-in invented cafe (7 people, 32 shifts, 235 hours), one limit at a time.

**Daily cap.** No cap, 12 and 10 hours: 3 shifts open, 216 hours covered, $3,622. At 9 and 8 hours: 4 open, 209 hours, $3,505, because nobody can stack a 3-hour lunch on an 8-hour close. At 6 hours, below the longest shift, 27 shifts go open: a typo to look for.

**Days in a row.** Six (the default) costs nothing. Five leaves 4 open and pays $36 more; four leaves 5 open yet covers 220 hours, since the short shifts are dropped first; three leaves 7 open.

So watch open shifts, not just hours or payroll. One invented example, not a benchmark. The [page](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/days-in-a-row-and-daily-hour-limits.html) has the tables, and a test re-runs every figure through the engine.
