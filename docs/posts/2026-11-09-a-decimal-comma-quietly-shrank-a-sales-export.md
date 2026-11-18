---
title: "A decimal comma quietly made a sales export a thousand times too small"
seo_title: "Hourly sales CSV import: decimal comma, negatives, month-name dates"
date: 2026-11-09
tags: [shift-roster-builder, scheduling, csv, bugs]
description: "Probing the sales-to-shifts importer of a free shift scheduler with made-up exports found four formats it misread, one of them without any warning."
---

Shift Roster Builder can turn an hourly sales export from a till into the
shifts a week needs: average each weekday-hour, divide by a sales-per-labor-hour
target, cut the headcount profile into shifts. Until today it had only been
fed CSVs written by hand, so I wrote nine small exports in the styles tills
and spreadsheets produce and ran them through the reader.

Four failed. Three were loud: `(12.50)` (the accounting way to write a refund),
dates like `"Mar 5, 2026 2 PM"`, and hour intervals such as `14:00-15:00` beside a
weekday were skipped with a row-by-row reason.

The fourth was silent. A continental export writes `1.234,50` for one
thousand two hundred thirty-four and fifty cents. The reader stripped commas
and parsed `1.23450`, so that hour counted as a little over one dollar. Nothing
was skipped and nothing was reported. With every hour of a European export
scaled down that way, the heads needed would collapse to the minimum staff
everywhere and the schedule would look plausible.

The fix reads the last separator as the decimal mark when both appear, reads a
lone comma as thousands only in the `1,234` shape, and treats dotted dates
(`05.03.2026`) as day first. Each is a unit test. None of it has met a real
export; the exports are made up, and the README says so. A real till export is
still the open item.
