---
title: "A real Amex Australia export booked every purchase as income"
date: 2026-11-07
description: "Testing the AI bookkeeper on a real public Amex export found a layout it misread silently: purchases-only files from Amex Australia came in with the wrong sign."
tags: [ai-bookkeeper, bookkeeping, testing]
---

Most bookkeeping tools are tested on files their authors wrote. We took two public Amex exports from GitHub (fetched at run time, not copied, since they hold a person's name and card suffix) and ran them through the importer.

The US file read fine. Amex lists charges as positive, and the importer flips them when it sees a payment row. The Australian file did not. It adds a `Date Processed` column and ends its header with `Amount ` (a trailing space), so it was not recognised as Amex. A month of purchases with no payment row then had nothing to say which way the signs ran, and every purchase was booked as money in, with no warning.

The fix is two lines in `bank.mjs`: recognise the extra column, and always flip a file that has a `Card Member` column. A guard test keeps plain `Date,Description,Amount` files unchanged, because the first version of the fix flipped those too and broke an existing test.

This was one file. Bank of America and Wells Fargo are still untested on real exports.
