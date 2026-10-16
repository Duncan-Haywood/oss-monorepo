# Whatnot Sales Report Analyzer

A free browser tool for Whatnot sellers: **load your seller orders CSV and see which shows
and categories actually make money.** The file is read in the browser; nothing is uploaded
and no Whatnot account access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/whatnot-sales-report-analyzer/

After using this, you can now **see profit per sale, per show, per category and per month
after Whatnot's commission and payment processing, the effective fee rate, cost per SKU,
the low-price sales that barely pay, and your worst and best sales**, and copy a
plain-text summary, which used to mean building the pivot table by hand or trusting the
payout total alone.

## Input

Any CSV with an `Order Date` (or `Sale Date`) and a sold price (`Sold Price` or `Sale
Price`). `Product Name`, `Show`, `Category`, `SKU`, `Order ID`, `Shipping Charged`, `Sales
Tax`, `Commission`, `Processing Fee` (or a single `Fees` column), `Net Earnings`, a `Cost`
column and `Status` are used when present. **Column names are matched by alias from memory of Whatnot's export; no
real export was available.** If a real export is not read, the page
lists the rows it skipped and why, and a sheet with the headers above always works; that
report is the priority fix. Comma/tab/semicolon files, quoted fields, US and day-first
dates and UTF-16 exports are read.

## Model

Fee: the file's fee columns, otherwise editable rates: commission (8% of the item price by
default) plus processing (2.9% of item + shipping + tax, plus 30 cents), the same constants
as `../whatnot-seller-payout` (a test asserts they stay equal). Category caps and reduced
rates are not modelled; set the commission rate to your own. Payout: the net earnings column
when present, otherwise price minus fees; a gap between price minus fees and net earnings is
an "other deduction". Profit: payout minus cost, where cost is a file column or pasted
`SKU,cost` pairs (pasted wins; matched by SKU, then order ID, then exact name). Sales with no
cost are excluded from profit and the verdicts, and the page says so. Shows and categories
that lost money need at least three costed sales and a negative total. Cancelled, returned
and refunded orders are left out and counted.

## Run

Open `index.html` through any static server. Tests: `node --test`.
