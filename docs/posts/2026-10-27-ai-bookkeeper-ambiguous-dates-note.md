---
title: "A bank file that reads two ways: ai-bookkeeper now says when it guessed the date order"
date: 2026-10-27
description: "Ten real spreadsheet statements from OCA's bank-statement-import all read, but one file's dates (01/04, 02/04) were silently booked to January and February."
tags: [ai-bookkeeper, bookkeeping, bank-statements]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank exports from spreadsheets as well as CSV. We ran the five xlsx and five xls test files from the open-source OCA bank-statement-import project through the reader (cloned at run time, nothing copied). All ten read, and the xlsx and xls copies of each came out identical.

One file showed a quiet risk. Its dates were `01/04/20` and `02/04/20`: four rows, every date valid as day-first or month-first. The reader fell back to month first and booked January and February; the bank, French by its headers, meant 1 and 2 April. That is a wrong-period booking with no warning.

The reading is not changed, since nothing in the file settles it. But when every date is ambiguous (three or more rows, two or more distinct dates, no recognised bank layout, no explicit order), the result now carries a note saying so and how to override with `dayFirst`. Known US layouts such as Chase and Schwab stay quiet. Tests: `ambiguous-dates.test.mjs`; details in the README.
