---
title: "Bank CSV dates that Excel turned into numbers"
date: 2026-11-04
description: "Open a bank CSV in Excel, save it, and the dates can become five-digit numbers. The ai-bookkeeper bank reader now reads them."
tags: [ai-bookkeeper, bookkeeping, csv]
---

# Bank CSV dates that Excel turned into numbers

A bookkeeper opens a bank download in Excel to tidy it, saves it as CSV, and
the Date column now says `46297`. That is Excel's day count: days since
1899-12-30, so 46297 is 2 October 2026.

Until today the ai-bookkeeper reader skipped those rows with "unreadable date".
It now reads a five-digit number between 25569 (1 January 1970) and 60000 (the
year 2064) as an Excel day number, with an optional time fraction (`46300.0`).
Anything outside that range is still refused, so an ordinary amount or
reference in the wrong column is not turned into a date. Eight-digit dates such
as `20261002` and the epoch-seconds forms read as before.

Checked with made-up rows and two anchor dates (25569 is 1970-01-01, 45292 is
2024-01-01) in `excel-serial-dates.test.mjs`. It covers the 1900 system only;
a Mac workbook in the old 1904 system would be off by four years and is not
detected.
