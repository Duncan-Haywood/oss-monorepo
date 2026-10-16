# QuickBooks Import CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/quickbooks-import-csv-check/>

A free browser tool for bookkeepers and small-business owners who load customers, vendors or
products and services into QuickBooks Online from a spreadsheet: **choose what you are importing,
paste or drop the CSV and see every problem with its line number before the import skips rows,
then download a safe-fixes copy or a set of files split to the import size.** The file is read in
the browser; nothing is uploaded and no login is needed.

After using this, you can now **find the two customers whose names collide once capitals and double
spaces are ignored, the `Acme: East` that becomes a sub-customer, the `$1,250.00` and `340,50`
balances, the balance with no as-of date, the file that mixes `13/01/2026` and `01/13/2026`, the ZIP
that lost its zero, the tax ID Excel turned into `1.23E+08`, and the 3,400-row file QuickBooks will
not take in one go**, which used to mean an import that quietly skipped rows and a scroll through
the results.

## Checks

Per record: blank, repeated (case and spacing insensitive), over-long, colon, quote and control
character names; email syntax; phone, ZIP and tax ID scientific notation; four-digit ZIPs; opening
balance format and symbols; balance with no as-of date; date format and day/month ambiguity across
the file. Vendors: tax ID digit count, 1099 flag values. Products and services: Type spelling,
sales price and cost formats, repeated SKUs, inventory quantity, as-of date and asset account,
services carrying a quantity. File level: 2 MB size, 1,000-row limit, delimiter, ragged rows, Excel
error values, garbled accents, byte order mark.

## Safe fixes

`repair()` converts the delimiter to commas, trims spaces at the ends of a name, rewrites money
columns (`$1,250.00` to `1250.00`, `12,50` to `12.50`) and rewrites a Type as QuickBooks spells it.
It never edits an email, phone, address, ZIP, SKU, tax ID or description, and it lists every change.
`splitRows()` writes parts of at most 1,000 rows, each with the header.

## Not covered

Whether QuickBooks will accept the file today, names already in the account, whether accounts, tax
rates and lists exist, and anything Intuit changes. Column names and limits are read from memory of
Intuit's public import help pages and every limit is worded as "commonly documented". It is not
accounting or tax advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
