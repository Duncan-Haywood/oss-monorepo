---
title: "Fuzzing the bookkeeper's spreadsheet reader found a three-second stall"
date: 2026-10-29
tags: [ai-bookkeeper, testing]
description: "Mutating Excel and PDF fixtures byte by byte found one old .xls that stalled the free AI bookkeeper's reader for seconds. A two-line bound fixed it."
---

The free AI bookkeeper reads bank statements from CSV, OFX, Excel and PDF files, all in your browser. Its existing mutation test cut and corrupted the text formats but skipped the binary ones. This run did the same to two `.xls`, two `.xlsx` and two PDF fixtures: 150 cut, byte-flipped and byte-deleted copies of each.

Every failure was a plain, readable error, which is what you want from a hostile or half-downloaded file. One copy was different. An old-style `.xls` whose directory entry claimed a name 65,535 characters long made the reader build that string for every entry, about 3.4 seconds and heavy garbage collection before it said "no Excel workbook stream". A second path let a damaged header claim a huge sector size.

Names longer than the format allows are now skipped and a sector size other than the two real ones is refused. The same file fails in 2 ms. A test builds both kinds of damage from a fixture and fails without the fix.

The reader runs in the uploader's own tab, so the worst case was a stalled page, not a server problem. It was still a bug, and a cheap one to find.
