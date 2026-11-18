---
title: "A bank statement reader meets statements it did not write"
seo_title: "Testing a bank statement PDF to CSV converter on an outside benchmark"
date: 2026-11-11
tags: [bank-statement-pdf-to-csv, pdf, bookkeeping, benchmarks, testing, xero, quickbooks]
description: "Our free statement PDF converter was only ever tested on its own PDFs. On an outside benchmark it read 1 of 5. What broke, and what it reads now."
---

The [bank statement PDF to CSV converter](https://marisstella.app/bank-statement-pdf-to-csv/)
reads a statement PDF in the browser, writes a CSV for Xero, QuickBooks or a
spreadsheet, and proves the result against the statement itself: opening
balance plus every row must equal the closing balance, to the cent. Paid
converters charge per page for this. Ours is free and nothing is uploaded.

Until today every test it had passed used PDFs its own test code generated.
That is a weak test: the same person wrote both the reader and the PDFs, so they
share the same blind spots.

## An outside benchmark

An independent, MIT-licensed
[bank statement parsing benchmark](https://github.com/bankstatemently/bank-statement-parsing-benchmark)
publishes synthetic statements from fictional banks, built around named parsing
challenges. Five were public today: a US credit card, Singapore, the
Netherlands (in Dutch), Hong Kong (English and Chinese) and Canada (in French).
The ground truth is kept on the benchmark's server, but each file states how
many transactions it holds, and every statement prints its own balances. That
is enough to score a reader that proves its output.

**Before: 1 of 5.** The Singapore statement converted and reconciled. Three
produced no rows at all. Hong Kong produced rows, then reported a broken balance
halfway through.

## What broke

None of the faults was specific to one bank. Each was a general gap:

- **A table further down relabelled every row.** The reader took its column
  layout from the last heading it saw. The card statement has an interest
  charges box below the transactions, with a "Balance" column right where the
  amounts were, so every amount was read as a balance and dropped. Each row now
  uses the heading above it.
- **The euro sign.** Every Dutch amount ended in byte 0x80. In the encoding most
  PDFs use for Western text (WinAnsi, which is Windows-1252) that byte is €. The
  reader decoded it as Latin-1, where it is an invisible control character, so
  "114,83 €" was not a number.
- **French amounts.** "10 598,70 $" uses a space as the thousands separator and
  puts the currency after the number. Headings like "Chèques et débits" and
  balance labels like "Solde d'ouverture" carry accents the reader never folded.
- **Two accounts in one PDF.** The Hong Kong statement lists a HKD current
  account and then a USD savings account. The USD balance starting at 150,000
  looked like a missing row worth about 131,600. Now a line that names an
  account, followed by a balance that starts over, begins a new account. Each
  account is proved on its own, by an unbroken running balance and its printed
  deposit and withdrawal totals. You can download one account for Xero or
  QuickBooks, or all of them with an Account column.
- **Text that is not a row.** A footer printed a point or two below a
  transaction was merged into it. A watermark, "Totals Year-to-Date" and a
  download date were appended to descriptions.

**After: 5 of 5**, each with the right number of rows and proved by its own
balances. The card statement is now recognised as a card without being told,
from the phrases only card statements print ("minimum payment due", "payment
due date", "credit limit"). Not one of the 99 descriptions carries a footer or
watermark.

## The part that did not carry over

Five files that were used to find the faults are not a test of the fixes. So
before calling it done, the reader ran on two more statement PDFs from other
open-source parsers, each with its own ground-truth CSV.

**It failed both**, and the version from this morning failed them the same way.
They use two layouts the benchmark does not have:

- the date printed only on the first row of each day, with later rows blank;
- amounts printed with one decimal ("1935.3").

With those two added, the first file matches all 100 rows on date and signed
amount (80 before). The second, a test file built to be awkward, matches 56 of
62 (15 before). Its six misses come from a balance printed without decimals and
a description printed above its amount. The tool does not hide them: the
balance check fails and names the line where it first breaks.

## What this does not show

None of these statements came from a real customer of a real bank. They are
synthetic or test fixtures, and the last two files are now development data
too. A real statement is still the next measurement, and the balance check
exists for exactly that reason: if a row is misread, the totals stop adding up
and the page says by how much.

The method, file hashes and every number are in the converter's
[eval README](../../ventures/bank-statement-pdf-to-csv/eval/README.md).
