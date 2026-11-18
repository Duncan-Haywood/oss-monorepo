---
title: "The bank headers we wrote from memory were wrong: 22 real US exports through the importer"
seo_title: "Importing Navy Federal, Truist and TD Bank CSV files"
date: 2026-11-12
description: "Run through ai-bookkeeper's importer, 22 public US bank exports gave four faults. The Navy Federal, Truist and TD headers written from memory were all wrong."
tags: [ai-bookkeeper, evaluation, bookkeeping, bank-import]
---

The ai-bookkeeper reads bank CSV files from dozens of banks. For many US banks the column layouts were written from memory, with made-up rows, and the README said "no real download was tried". This run tried some.

People commit their own bank exports to public GitHub repositories more often than you would hope: budgeting scripts, tax helpers, class projects. A code search for each bank's header line found 22 files. Eleven look like real downloads: Citi card statements, TD Bank checking, Truist, Bank of America card, Capital One, Discover and Amex. The other eleven are anonymised rows in a bank's real layout (Navy Federal, TD, Truist, Bank of America and Chase checking, US Bank). None of them has a licence, and several hold names and account digits. So the evaluation script fetches them at run time and commits nothing. The tests use rows written by hand under the same headers.

The good news first. Before any change, the importer read 1,498 of the 1,499 transaction rows, and no payment or deposit had the wrong sign. That includes the awkward cases. Navy Federal writes every amount as positive, with a separate "Credit Debit Indicator" column. Truist writes debits in parentheses, `($31.72)`. Citi puts refunds in its Credit column as negative numbers.

Then the faults:

1. **The headers from memory were all wrong.** Navy Federal, Truist and TD each had a header the importer would name, and none matched the real files. Their columns still read, because the reader matches columns by name and not by bank, but the bank label was missing on 10 of the 22 files.
2. **TD's running balance was never checked.** TD calls it "Account Running Balance", a name the reader did not know, so 374 TD rows went in with no balance check. The check now runs on all three TD files. Two balance to the cent. The third has one deposit whose printed balance repeats an earlier day's, which looks like a hand edit in that person's file. The importer now flags it instead of saying nothing.
3. **TD doesn't quote commas.** A description like `EGOV STRATEGIES, SERVICE` arrives as two cells, which pushes the debit into the next column, so the row was dropped as "unreadable amount". The fix is narrow: it applies when a row is wider than the header and its money columns only read once the description is joined back together. Then the pieces are joined and the import says so.
4. **Line numbers drifted.** Bank of America leaves a blank line under its summary block. The importer skipped blank lines and counted rows, so every problem it reported after that pointed one line too high. Each row now keeps its line number in the file.

One column is left alone on purpose. Truist's "Daily Posted Balance" is filled in only on the last row of each day, so it is not a running balance, and reading it as one would report false breaks.

After the fixes, the importer reads 1,499 of 1,499 rows and names the bank on all 22 files. The run is reproducible: `node eval/us-bank-exports.mjs` in `ventures/ai-bookkeeper`. Every file is a personal account, though. A small business's own bank export, with its ACH batches and merchant deposits, is still the input we most want and don't have. If you keep books for one and would share an anonymised export, the [ai-bookkeeper page](https://marisstella.app/ai-bookkeeper/) runs entirely in your browser, and an issue with a redacted sample would be welcome.
