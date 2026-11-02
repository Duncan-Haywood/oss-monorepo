---
title: "Testing a bank-file reader with files we generate"
seo_title: "How to test a BAI2 bank statement parser with generated files"
date: 2026-11-02
tags: [ai-bookkeeper, testing, bai2, bookkeeping]
description: "A BAI2 reader was tested on one hand-written file. Generating 300 files with known answers checks signs, dates and balances far harder."
---

BAI2 is the statement format US business banks offer next to CSV. Our bookkeeper's reader for it had one hand-written example file in its tests. That proves the reader handles that file, nothing more.

The stronger check is to **build the answer first**. A small generator writes random BAI2 files: credit codes 100 to 399, debit codes 400 to 699, five different funds-type layouts, one to three daily groups, Unix and Windows line endings. It records the signed cents and date of every line as it writes them. The test then reads the file back and compares.

Results from 300 seeded files:

- every amount came back with the right sign and the right date, including value dates from `V` funds types;
- the closing ledger balance reported was always the latest group's;
- truncated and line-shuffled copies never threw an error, and every row had whole cents and an ISO date.

We also checked that the test can fail: turning debits into credits in the reader makes it fail at once, and that change was reverted.

It found no defect this time. That is a result too: the reader's sign and date logic now has 300 checked cases behind it rather than one. What it does not show is whether real bank files match the layout, because the files are invented from the specification. If you have a BAI2 file from your bank (with account numbers removed), the bookkeeper's reader is free to run on it, and a mismatch is the most useful bug report we could get.

The test is `ventures/ai-bookkeeper/bai2-fuzz.test.mjs`, in the MIT-licensed repository.
