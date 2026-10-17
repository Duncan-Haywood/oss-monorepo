# BAI2 Statement Reader

A free browser tool for anyone who receives bank statement files in BAI2 format:
**paste or drop the file and see its accounts, balances and transactions as a table,
download a CSV, and find out why an import fails, with the line number.** The file is read
in the browser; nothing is uploaded and no login or bank access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bai2-statement-reader/

After using this, you can now **read a BAI2 file without a developer, export the
transactions to a spreadsheet, find the missing slash, the amount written with a decimal or
the control total that stopped matching after an edit, and rebuild the trailers**, which used
to mean an import error and a call to the bank.

## Input

One BAI2 file: 01 file header, 02 group header, 03 account (balances), 16 transaction, 88
continuation, 49 account trailer, 98 group trailer, 99 file trailer; comma-delimited, each
record ending in a slash. CRLF, LF or one unbroken string are accepted. **The layout, type
codes and control-total conventions are from memory of the public format; no bank's own
validator was available when this was built.** Account numbers are masked to their last four
digits in the report and in both CSVs.

## Checks

Closing slashes; record order and trailers present; header dates and times; whole-cent
amounts; type codes (credit 100-399, debit 400-699, balances 010-099); 49 account control
total against four known sums; 49/98/99 record counts including 88 lines; 98 and 99 totals as
the sum of the totals below; account, group counts; opening ledger plus activity against
closing ledger; duplicate bank references.

## Repair

`repair()` rebuilds the 49, 98 and 99 trailers from the records and lists what changed. It
never edits a transaction or balance. It uses the control-total convention the file already
follows.

## Run

Open `index.html` through any static server. Tests: `node --test`.
