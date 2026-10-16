# QuickBooks Chart of Accounts CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/quickbooks-chart-of-accounts-csv-check/>

A free browser tool for bookkeepers and accountants who load a chart of accounts into QuickBooks
Online by CSV: **paste or drop the file and see every problem with its line number before the
import skips accounts, then download a cleaned copy.** The file is read in the browser; nothing is
uploaded and no login or API key is needed. Customers, vendors and items are covered by the sibling
`quickbooks-import-csv-check`; the engine here also reads those layouts but the page checks accounts.

After using this, you can now **find the account typed `Expense`, the blank detail type, the account
number used twice, the sub-account listed before its parent and the balance on an income account**,
which used to mean a "some rows were not imported" message and a hunt through the file.

## Input

A CSV for one of four QuickBooks Online imports: customers, vendors, products and services, or the
chart of accounts. The type is detected from the headings or chosen by hand. Comma, semicolon or
tab separated; UTF-8 with or without a BOM. Headings can differ from QuickBooks' own: common
variants are mapped, and anything else is a note, because the import screen maps columns by hand.

## Checks

Headings (blank, duplicate, unmapped, aliased); delimiter; unterminated quotes; cell counts per
row; the 1,000-row file limit; required name; length limits; duplicate names (case-insensitive,
trailing-space aware); emails; phone numbers; websites; US states and ZIP codes (lost leading
zeros, ZIP+4); tax IDs (digit count, lost zero, repeats, 1099 vendors without one); terms;
opening balances and as-of dates (calendar validity, one date order, Excel serials); money
formats; product types, quantities, asset and income accounts, duplicate SKUs; account types,
detail types, numbers, sub-account order and balances on income and expense accounts; encoding.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change: delimiter,
heading capitals, stray outer spaces, money formatting (`$1,200.00`, `9,50`, `(300.00)`), full US
state names to two-letter codes when the country is the US, and a `mailto:` prefix. It never edits
a name, number, tax ID, SKU, date, balance amount or free text. `splitCsv()` cuts a large file into
1,000-row parts that each carry the header.

## Run

Open `index.html` through any static server. Tests: `node --test`.
