# Xero Invoice CSV Check

A free browser tool for bookkeepers, freelancers and small businesses who bulk-import sales
invoices into Xero from a spreadsheet or billing export: **paste or drop the file and see every
problem with its line number before the import fails or posts the wrong thing, then download a
cleaned copy or a set of import-sized files.** The file is read in the browser; nothing is
uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/xero-invoice-csv-check/

After using this, you can now **find the date written in two different orders, the invoice whose
second line has a different due date, the Account Code that is really an account name, the Tax Type
typed as `20%`, the invoice number Excel turned into `1.00E+12` and the date saved as `46300`,
convert the dates, and split a 2,000-line file at invoice boundaries**, which used to mean a
rejected upload and a hunt through the rows.

## Input

A sales invoice CSV in Xero's import template layout (`*ContactName`, `*InvoiceNumber`,
`*InvoiceDate`, `*DueDate`, `*Description`, `*Quantity`, `*UnitAmount`, `*AccountCode`, `*TaxType`,
plus optional address, tracking, currency and branding columns). Comma, semicolon or tab
separated; UTF-8 with or without a BOM.

## Checks

Headings and duplicates; required columns and cells; delimiter; unterminated quotes; cell counts;
per-invoice agreement of contact, dates and currency; line grouping; date order, validity, serial
numbers and two-digit years; due date before invoice date; quantity, unit amount and discount
formats; account code and tax type shape; invoice number and contact spelling variants; Excel
damage; currency codes; email; tracking pairs; encoding; file length.

## Check against your own Xero lists

Paste the chart of accounts export, the contacts export (or one name per line) and your tax rate
names, and `crossCheck()` compares every line: account codes that do not exist, an account *name*
in the code column (the safe-fixes pass swaps in the code), archived accounts, non-revenue
accounts, contacts that differ from an existing one only by case, punctuation or a `Ltd`/`Limited`
suffix (Xero would create a duplicate), and tax rate names that are not spelled exactly. Export
headings were read from memory, so matching is loose. The lists stay in the browser.

The report also prints control totals (net before tax, per currency, with invoice counts) so a
bookkeeper can reconcile the file against the source system before importing.

## Safe fixes and splitting

`repair()` changes only things with one reasonable reading and lists every change. It never edits a
contact, description, invoice number, amount digits, account code digits or tax type.
`splitInvoices()` cuts a file into parts of at most 500 lines without separating an invoice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
