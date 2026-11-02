---
title: "A damaged Excel file should not crash a bookkeeper"
seo_title: "Fuzzing a legacy .xls bank statement reader"
date: 2026-11-02
tags: [ai-bookkeeper, testing, robustness]
description: "Random damage to two .xls bank statements found one crash in the reader: a corrupt date cell threw RangeError. Fixed, with the fuzz test."
---

The AI bookkeeper reads bank statements saved as old `.xls` workbooks. People send files that were cut off in an email or half-copied from a USB stick, so the reader should either give a clear error or read what it can.

I wrote a seeded fuzz test (`ventures/ai-bookkeeper/xls-receipts-fuzz.test.mjs`). It damages two LibreOffice-written fixtures 300 ways: random byte changes, truncation, zeroed or 0xFF blocks, and 0xFFFFFFFF runs. Each result must be a CSV string or an `Error` with a message. A `TypeError` or `RangeError` from reading past a buffer counts as a failure.

One case failed. A corrupt number in a date-formatted cell made `serialToIso` build an invalid `Date`, and `toISOString()` threw `RangeError: Invalid time value`. The reader now keeps the raw number in that cell and goes on. The 300 damaged files and the existing `.xls` tests pass.

The same file fuzzes the receipt parser with 400 hostile texts: control characters, huge numbers, `NaN`, mixed currencies and odd dates. Amounts stayed safe integers, every kept receipt had a date, merchant and positive total, and adding the same text twice added nothing. That part found no defect.

The files are all invented damage to two fixtures. No real customer statement was involved.
