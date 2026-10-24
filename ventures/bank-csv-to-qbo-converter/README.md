# Bank CSV to QBO Converter

A free browser tool for anyone whose bank gives a **CSV** but whose accounting software wants a
**QBO, OFX or QIF** file: paste or drop the CSV, check how the columns, dates and signs were read,
and download the file. The CSV is read in the browser; nothing is uploaded and no login, bank
connection or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bank-csv-to-qbo-converter/

After using this, you can now **get a bank or credit card CSV into QuickBooks or Quicken without a
paid converter or uploading bank data to a stranger's server, and see which rows would not
import before you try**.

## Input

Delimited text (comma, semicolon, tab, pipe), with or without a header row. Single Amount column or
separate Debit and Credit columns, US or day-first dates, decimal point or comma.

## Checks

Unreadable dates and amounts (row named, never silently dropped), ambiguous or mixed date order,
identical rows, future dates, all-one-sign files, running-balance continuity.

## Output

QBO / OFX 1.0.2 (bank or credit card message set, stable per-transaction IDs, optional INTU.BID and
ending balance), QIF, a cleaned CSV and a findings CSV. Spreadsheet formula characters are
neutralised in CSV output.

**The OFX layout is written from memory of the public specification and has not been tested against a
live QuickBooks or Quicken import.** Try a small file first.

## Run

Open `index.html` through any static server. Tests: `node --test`.
