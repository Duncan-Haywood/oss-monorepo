---
title: "Shift roster builder prices late schedule changes from the command line"
date: 2026-10-27
description: "node cli.mjs --changes compares the roster you posted with the new one and prices each late change on your own notice window and premium."
tags: [shift-roster-builder, scheduling, cli]
---

Posting a schedule and then changing it is where small restaurants and shops pick up pay they did not plan for. The page already had a changes report; [shift-roster-builder](../../ventures/shift-roster-builder/) now has the same report in `cli.mjs`, for people who keep the week in text files and run a script.

`node cli.mjs --changes posted.csv --week-start 2026-11-02 --changed-at "2026-11-01 12:00" staff.txt shifts.txt` lists every shift added, cancelled or moved, the hours of notice each got, and the premium owed on the numbers you give with `--notice-hours`, `--premium-hours` and `--exempt` for changes an employee asked for. On the invented sample week, dropping one posted Monday shift the day before reads "Gus added 6am-2pm, 18 h notice, premium $19".

The rule is yours to enter. Nothing here says what any city's ordinance requires, and it is checked on the invented week, not on real payroll.
