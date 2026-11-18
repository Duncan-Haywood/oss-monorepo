---
title: "A 6.5-Hour Shortest Shift Froze the Page"
seo_title: "Why a Decimal Shift Length Hung the Shifts-From-Sales Planner"
date: 2026-11-14
tags: [shift-roster-builder, redteam, testing]
description: "Typing 6.5 hours as the shortest shift sent the sales-to-shifts planner into an endless loop. Shift lengths are now whole hours, with a plain error message."
---

The [shifts-from-sales page](/shift-roster-builder/shifts-from-sales.html) turns a till export into shift lines: it averages sales per weekday-hour, works out how many people each hour needs, then cuts that profile into shifts between a shortest and a longest length. The two length boxes accepted decimals. Today's red-team run found that a decimal there could freeze the page.

## What happened

Take a day open 9:00 to 15:00 with one person all day and a second at 14:00. With a shortest shift of 6.5 hours, the cutter has to stretch the 6-hour day to 6.5 hours. Nothing is open after 15:00 or before 9:00, so the stretch ends at **15.5**. The cutter then moves on hour by hour from 15.5. No hour 15.5 exists in a 24-slot day, so the comparison that should say "nobody needed here" got `undefined` and treated the slot as the start of a run with no hours in it.

What came next depended on one setting:

- **With the cost-weighted cut** (the default when the file has dated rows), that zero-length run was "dropped as not worth staffing" with no step forward. The loop asked the same question about hour 15.5 forever, and the browser tab locked up.
- **Without it**, the cutter returned phantom shifts: two people from 15:30 to 21:30, after the shop had closed.

A whole-number length never reaches the fractional slot, which is why 4 or 8 always worked.

## The fix

Shift lengths are now whole hours. `cutShifts` refuses anything else with "the shortest and longest shift must each be a whole number of hours". The page shows that message in its usual problem box, and the CLI prints it. Both length boxes now bring up a numeric keypad, not a decimal one. A new test file, `shift-length-whole.test.mjs`, hung before the fix (it ran into its 30-second limit) and passes after it.

A real half-hour shortest shift would need the whole planner to work in 30-minute slots, not just this check. Rejecting the input is honest about what the tool can do today. Accepting it and freezing was not.

## The second find: a suite that was red from the wrong folder

The red-team tool refused to start because the venture's own test suite failed on unchanged code. One test ran `node cli.mjs` without saying which folder to run it in. That works from inside the venture's folder and fails from the repository root, which is where the red-team tool runs. The four other test files that call the CLI already pass `cwd: import.meta.dirname`. This one now does too.

To catch the next one before a red-team run does, `platform/ci/check_test_spawn_cwd.py` reads every `*.test.mjs` and `*.test.js` in the repository and fails on a call that runs `node <relative script>` with no `cwd`. It found the three calls in the old file and nothing else in the current tree. Pull requests already run it automatically, because `unwired_checks.py` picks up any new `check_*.py` script that no workflow names.
