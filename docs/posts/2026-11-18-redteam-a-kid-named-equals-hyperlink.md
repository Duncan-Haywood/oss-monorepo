---
title: "Red team: a kid named =HYPERLINK, and 152 more spreadsheets that would have run it"
seo_title: "CSV formula injection in 152 free calculators, fixed in one sweep"
date: 2026-11-18
tags: [redteam, security, youth-lineup-rotator, rrule-explainer]
description: "A red-team run seeded 22 faults in two tools, found a CSV formula-injection hole in a lineup planner and closed it in 152 exporters."
---

Each red-team run seeds faults in code that tests already cover, counts how many the tests
catch, then goes looking for real bugs. This run aimed at two tools that changed this week:
the [Youth Lineup Rotator](https://marisstella.app/youth-lineup-rotator/) and the
[RRULE explainer](https://marisstella.app/rrule-explainer/).

## What the tests caught

| Target | Seeded | Caught | Escaped |
|---|---|---|---|
| `youth-lineup-rotator/calc.mjs` | 10 | 9 | 1 |
| `rrule-explainer/rrule.mjs` | 12 | 10 | 2 |

Two of the three escapes were real gaps. In the lineup planner, `periodTable` could turn the
first player on the roster (index 0) into a blank cell and every test still passed. In the RRULE
explainer, the hint that tells you the exact `UNTIL=...T235959` value to paste was never read
by any test, so a broken hint would have shipped. Both now have tests, and a rerun of each
mutant fails. The third escape changed `m[4]` to `m[5]` in a regex where the two groups are
always both present or both missing. It can't change behaviour, so we marked it equivalent.
After the fix, every escaped mutant that could change behaviour is caught.

## What was really broken

**A spreadsheet formula in a child's name.** The lineup planner can share a setup by link, with
the whole roster inside the link. Someone opening that link and pressing "Download CSV" got
the names written straight into the file. A name like `=HYPERLINK("http://...")` runs as a
formula when the file opens in Excel or Google Sheets. That is CSV injection (CWE-1236), and
the fix is the usual one: put an apostrophe before any cell that starts with `=`, `+`, `-` or
`@`, unless the cell is just a number.

**A child who plays no period, with no warning.** `Ana | late: 3 | leaves: 1` (or `late: 4` in
a four-period game) was accepted, and Ana was quietly planned out of the whole game. Now the
page names her and explains that `leaves` has to come after `late`.

## Fixing the whole class

The repository already has a ratchet, `platform/ci/check_csv_formula_guard.py`. It lists every
CSV exporter that lacks this guard and fails if a new one appears. This morning the list held
508 files. Most of them quote cells with one of six one-line helpers, so the run patched those
helpers in place in 152 files across 136 tools and ran every one of the 136 test suites.

The first try at the sweep taught us something. A guard that treats only plain numbers as
numbers put an apostrophe in front of `-42,10` in the MT940 statement checker, which writes
European decimal commas. So the sweep counts any digits with commas or dots, anchored at both
ends, as a number. `-42,10` stays a number. `-1+cmd` still gets the apostrophe. The baseline now
lists 356 files, and the ratchet means it can only get shorter.
