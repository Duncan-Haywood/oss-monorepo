---
title: "Two ways an Excel sales export silently reads as zero rows"
seo_title: "Import POS sales CSV for staff scheduling: sep= line and (USD) headers"
date: 2026-11-09
tags: [shift-roster-builder, csv, scheduling]
description: "A shift scheduler that builds staffing from hourly sales lost every row to an Excel 'sep=,' first line and to a '(USD)' suffix in the header. Both are fixed."
---

shift-roster-builder can turn an hourly sales export into staffing levels
(`--from-sales`). Probing it with differently shaped made-up exports found two
more ways a perfectly ordinary file read as nothing:

- Excel writes `sep=,` as the first line of some CSVs. The reader took it for
  the header, found no sales column and returned zero rows.
- Headers like `Net Sales (USD)` or `Sales [GBP]` did not match the column name
  `Net Sales`, with the same result.

Both now read: the `sep=` line is skipped and a bracketed unit is dropped from
the header before matching. Tests use made-up rows; a real till export is still
the thing the project is waiting for.
