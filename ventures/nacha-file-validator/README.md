# NACHA File Validator

A free browser tool for anyone who sends payroll, vendor payments or collections through
their bank by ACH file: **paste or drop the file and see every structural error with its
line number before the bank rejects it, then rebuild the control records after a hand
edit.** The file is read in the browser; nothing is uploaded and no login, bank account or
API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/nacha-file-validator/

After using this, you can now **find the record that is 93 characters long, the routing
number with a bad check digit, the amount that no longer matches the batch total and the
effective date that lands on a bank holiday, and download a corrected file**, which used to
mean a bank's rejection email, a call, and counting columns by hand.

## Input

One ACH (NACHA) file: 94-character records, file header 1, batch header 5, entry detail 6,
addenda 7, batch control 8, file control 9. CRLF, LF or one unbroken string are accepted.
**Field positions are read by position from memory of the public file format; no bank's own
validator was available when this was built.** Account numbers are masked to their last four
digits in the report and in the findings CSV.

## Checks

Record length and characters; record order; file and batch header fields; service class
against the entries (220 with a debit, 225 with a credit); routing-number check digit (with
the digit that would pass); transaction codes, prenote and zero-dollar rules; trace numbers
(ODFI prefix, repeats, order); addenda indicator, sequence and link; possible duplicate
payments; WEB/TEL payment type; effective date on a weekend or Federal Reserve holiday;
batch and file entry counts, entry hash, debit and credit totals; block count and padding.

## Repair

`repair()` rebuilds the batch control, file control and blocking records from the entries
and lists what changed. It never edits an entry: a wrong routing number or amount is a
payment decision, not a typo.

## Run

Open `index.html` through any static server. Tests: `node --test`.
