---
title: "A semicolon in the memo hid a whole bank statement"
seo_title: "Why a US Bank CSV imported 0 rows, and the code hiding in its memo"
date: 2026-11-14
tags: [ai-bookkeeper, bank-csv, parsing, categorization]
description: "A real US Bank card export read 0 of 57 rows: its memo had more semicolons than the line had commas. The fix, and the merchant code the memo carried."
---

The [AI bookkeeper](../../ventures/ai-bookkeeper/README.md) reads bank and card
CSV files. To check that it reads the files people really download, we fetch
exports that people have put in public GitHub repositories and run the reader
over them. We don't commit those files. This round added seven, bringing the
total to 48 files and 4,506 rows. One of the new files read **zero rows**.

## What went wrong

The file is a US Bank card export. Every purchase line looks like this
(amount and merchant changed):

```
2024-02-08,DEBIT,HILLTOP GROCERY  SPRINGFIELD IL,24269794038500500000001; 05411; ; ; ;,-52.41
```

The reader has to guess the delimiter, because European banks use semicolons.
It picked whichever character split the most lines into the same number of
fields. Each line has four commas but five semicolons, all inside the memo, so
the semicolon won. The reader then looked for a date column and an amount
column, found neither, and returned an empty statement.

The fix uses the header row. The reader knows several hundred column names in
about twenty languages. If one delimiter splits some line of the file into two
or more of those names (`Date`, `Name`, `Amount`), that delimiter wins. If no
delimiter does that, the reader falls back to the old field count. Dutch
`Datum;Omschrijving;Bedrag` files still split on semicolons. After the fix,
the file reads 57 of 57 rows.

## What the memo was carrying

The second field of that memo is `05411`. That is the card network's merchant
category code (MCC), with a leading zero: 5411 means grocery stores. The other
lines carry 5542 for fuel, 5814 for fast food, 5712 for furniture and 5310 for
discount stores. The categorizer already uses MCCs when a file has a column for
them. Here the code was in the memo.

The reader now takes it from a memo shaped like this one: a reference number of
15 to 30 digits, then a four-digit code. On the real file, 18 of 55 purchases
got a category suggestion on first sight before. Now 33 do. None of the 18
earlier suggestions changed. Checked by eye, 13 of the 15 new suggestions are
right. A bookshop (5942) and a university museum (8220) both went to
"Education and dues", which is arguable at best.

## Credit unions

The same round found a layout that several US credit unions' online banking
sites write. Its columns are `Posting Date, Effective Date, Transaction Type,
Amount, ... Balance, Memo, Extended Description`. It read correctly with no code
change, and is now named. Its running balance checks out except in two kinds of
place.

- **Rows the uploader deleted.** In a 1,086-row download, the balance breaks
  at exactly two places. Both are where the person who uploaded it blanked out
  rows (`,,,,,,,`).
- **Card files.** A credit-union card file prints the balance you owe, which
  rises with each purchase. It chains once the sign is flipped, which the
  importer already does for card accounts.

Still not found in public: a US Bank checking download, and a business account
at any bank other than Chase. If you have one you can share with the account
numbers removed, the reader would like to see it.

The script is `node eval/us-bank-exports.mjs`. The rows in the tests are
written by hand, using the real headers (`credit-union-usbank-memo.test.mjs`).
