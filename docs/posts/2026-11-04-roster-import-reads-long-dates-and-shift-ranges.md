---
title: "Switching schedulers: the shift importer now reads long dates and one-column shift times"
seo_title: "Shift importer reads long dates and shift times"
date: 2026-11-04
description: "Probing the roster builder's published-schedule import with the date and time layouts spreadsheets really produce found five that failed. All now read."
tags: [shift-roster-builder, scheduling, import]
---

# Switching schedulers: the shift importer now reads long dates and one-column shift times

The roster builder's `--import-shifts` turns a published-schedule CSV from
another scheduling tool into this tool's shift lines, so a small business can
leave a paid scheduler without retyping a week.

Trying it with layouts spreadsheets and schedulers commonly write, instead of
the ISO dates it was first tested on, showed it skipped every row for:

- `Nov 2, 2026` and `November 2nd 2026`
- `2 Nov 2026`
- `Mon 11/2/2026` and `"Mon, 11/2/2026"`
- a single "Shift" column holding `7:00 AM - 3:00 PM`, `7am to 3pm` or `07:00-15:00`

All now read. A leading weekday is ignored and the calendar date decides the
day (`Feb 30` is still refused). A shift column that is not a range (a plain
`8.0` hours total) is skipped with a message saying why.

Not done: an unquoted `Nov 2, 2026` is split by its comma into two cells, so
that row is skipped with a message naming the date it saw; quote the cell.
These layouts are ones I expect exports to use, not ones checked against a real
7shifts, When I Work or Homebase file; the README still wants a real export.
Tests: `import-shifts.test.mjs`.
