---
title: "The Sunday close, Monday open that a weekly roster hides"
date: 2026-11-04
description: "The shift roster builder's rest-under report now looks across the week boundary when given last week's roster."
tags: [shift-roster-builder, scheduling, clopening]
---

# The Sunday close, Monday open that a weekly roster hides

A weekly roster is a closed box: the Sunday 11 PM close and the Monday 7 AM
open sit in different files, so a short turnaround between them is invisible to
a check that reads one week at a time.

`node cli.mjs --rest-under 11 --last-week last.csv staff.txt shifts.txt` now
reads last week's roster too, shifts it back seven days, and lists the
Sunday-to-Monday pairs next to the in-week ones, with the premium on whatever
window and hours you enter. Pairs wholly inside last week are not repeated.

One honest finding while testing: the builder already carries last week's end
times over Monday, so a default build leaves no such turnaround. The report
earns its keep on rosters you edited by hand, or when you run with `--rest 0`.
It is arithmetic on your numbers, not a statement of any scheduling law, and it
was tested on hand-built rosters only, not a real payroll.
