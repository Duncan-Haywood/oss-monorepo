---
title: "A missing bank statement shows up as exactly its own amount: a year of PDFs to one QBO file"
seo_title: "Convert a year of bank statement PDFs to one QBO or OFX file"
date: 2026-11-18
tags: [bank-statement-pdf-to-csv, bookkeeping, ofx, quickbooks]
description: "The statement PDF converter now joins a year of statements, checks each month opens where the last closed, and writes QBO, QFX, OFX or QIF files."
---

The [bank statement PDF converter](https://marisstella.app/bank-statement-pdf-to-csv/) already proved each statement against itself: the opening balance plus every row has to equal the closing balance. Two things people convert statements for were still missing. One was a bank download file, the `.qbo` or `.qfx` that QuickBooks Desktop and Quicken open as if the bank had sent it. The other was a whole year of statements at once. Paid per-page converters charge for both. Both now run free in the browser tab, and nothing is uploaded.

## A gap is the size of the month that is not there

Choose twelve monthly PDFs together. The page puts them in date order and proves each one on its own. Then it checks one more thing: each month has to open at the balance where the month before it closed.

That check catches the common mistake in a year-end catch-up, a month that never got downloaded. A month's net movement is its closing balance minus its opening balance. With June missing, May's closing and July's opening are June's opening and June's closing, so they differ by exactly June's net movement. On a made-up year of twelve statements, each built as a PDF and read through the real PDF route, leaving June out gave a gap of 2,383.17 between `2025-05.pdf` and `2025-07.pdf`. June's own net movement is 2,383.17.

The same statement chosen twice is counted once. When two downloads overlap, the rows they share are kept once.

## Ids that survive the next import

An OFX file gives every transaction an id (FITID), and importers skip an id they have already seen. Here the id is the date plus a hash of the date, amount and description, with a counter for identical rows on one day. So a row gets the same id in every file that contains it, and importing an overlapping statement next quarter does not double it. Two genuine identical transfers on the same day keep different ids, so both stay.

## What the first test caught

The first version left out the ledger balance when a statement did not prove, on the idea that a file should not report a balance it could not vouch for. ofxtools, a strict Python OFX reader, refused those files: the OFX standard requires a ledger balance in every statement. The file now always carries the balance printed on the statement, and the page says when the rows do not reach it.

After that fix, 12 files (OFX, QFX and QBO for four cases) went through three readers this tool did not write: the site's own [OFX file check](https://marisstella.app/ofx-file-check/), ofxtools and ofxparse. All three read the expected row count, net amount and balance from every file, with unique ids, and found 0 mismatches. The output is in `ventures/bank-statement-pdf-to-csv/eval/bank-files-2026-11-18.txt`.

## Not tested yet

Nobody has imported these files into QuickBooks or Quicken themselves, and every statement used was made up. Some QuickBooks Desktop versions also refuse a `.qbo` that lacks their own id for your bank. The page has a field for that id, which you can copy from a `.qbo` your bank gave you before. If your bank's statement misreads, or an import refuses the file, that is the report worth sending.
