---
title: "Is 05/03/2026 5 March or May 3? A schedule builder that stops guessing"
seo_title: "Day-first or month-first dates in a POS sales export"
date: 2026-11-10
tags: [shift-roster-builder, dates, csv, scheduling]
description: "The shift builder's sales reader now takes the date order from the whole file, reads compact stamps, and says so when nothing settles it."
---

[Shift Roster Builder](../../ventures/shift-roster-builder/) can build shift
lines from an hourly sales export (`--from-sales`). Its stamp reader took
`05/03/2026` as May 3 every time, with no warning. A café that exports day-first
would get its Thursday sales filed under Sunday.

What changed on 2026-11-10:

- One date in the file that can only be day first (`25/03/2026`) makes the whole
  file day first; one that can only be month first (`03/25/2026`) keeps it month
  first. The output notes which one it chose.
- If every date is ambiguous, it reads month first (US) and prints a note saying
  so, with the fix (export as `YYYY-MM-DD`).
- Compact stamps (`20260305 1400`, `20260305T140000Z`) now read; before they
  were skipped.

Checked on made-up rows only (`demand.test.mjs`, 24 pass). No real POS export has
been tried. A file where every date is ambiguous is still a guess; the note is
the honest answer.
