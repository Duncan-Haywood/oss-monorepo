---
title: "Shift scheduler now reads currency codes and Excel date serials in POS sales exports"
seo_title: "Import POS sales exports with currency codes and Excel dates"
date: 2026-11-10
tags: [shift-roster-builder, scheduling, pos]
description: "shift-roster-builder's --from-sales reads cells like 'USD 40.00' and Excel serial date-times such as 46328.5833."
---

`--from-sales` in shift-roster-builder turns an hourly sales export into shift
lines. Probing it with formats a till or a spreadsheet could plausibly write
showed two cells it skipped (it reports skipped rows, so nothing was silent):

- **Currency codes.** `USD 40.00` and `40.00 EUR` now read as 40; a symbol was
  already handled, a three-letter code was not.
- **Excel serials.** A date-time pasted from Excel as `46328.5833` (days since
  1899-12-30, the fraction is the time of day) now reads as Monday 2 Nov 2026,
  14:00. The fraction is rounded to the minute, since `.5833` is 13:59:57.

Both are tested on made-up cells only; no real POS export has been checked yet,
which remains the open item.
