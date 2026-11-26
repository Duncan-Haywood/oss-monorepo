# Whatnot Sales Report Analyzer

A free browser tool for Whatnot sellers: **load your seller orders CSV and see which shows
and categories actually make money.** The file is read in the browser; nothing is uploaded
and no Whatnot account access is needed.

**Live tool:** https://marisstella.app/whatnot-sales-report-analyzer/

After using this, you can now **see profit per sale, per show, per category and per month
after Whatnot's commission and payment processing, the effective fee rate, cost per SKU,
the low-price sales that barely pay, and your worst and best sales**, and copy a
plain-text summary, which used to mean building the pivot table by hand or trusting the
payout total alone.

## Input

**Whatnot's Seller Weekly Orders Report** (Seller Hub > Financials > Statements, one CSV per
week) is read by the column names, transaction types and meanings in Whatnot's own help
article ([36772664621837](https://help.whatnot.com/hc/en-us/articles/36772664621837-Seller-Weekly-Orders-Report),
"Metric Definitions", read 2026-11-26): an `Order Earnings` row is a sale, dated by
`Transaction Completed at UTC`, priced at `Post Coupon Price`, with `Commission Fee`,
`Payment Processing Fee` and the two taxes on fees as its fee, `Transaction Amount` as its
payout and `Cost of Goods` as its cost; a giveaway (price 0) is kept so its shipping counts.
An `Order Refund` row (by `Order ID`) or a `Shipping Charge` row (by `Shipment ID`) is taken
off the sale it belongs to as a deduction; one whose sale is in another week's file is named
on the page. `Tips` are skipped. In this report `Shipping Fee` is what the seller paid, and
the buyer's shipping and tax are `Buyer Paid` minus the price. The rows in the tests are
authored, not from a real file.

Any other CSV with an `Order Date` (or `Sale Date`) and a sold price (`Sold Price` or `Sale
Price`) also works. `Product Name`, `Show`, `Category`, `SKU`, `Order ID`, `Shipping Charged`, `Sales
Tax`, `Commission`, `Processing Fee` (or a single `Fees` column), `Net Earnings`, a `Cost`
column and `Status` are used when present; those names are matched by alias from memory of
other exports. If a file is not read, the page lists the rows it skipped and why, and a
sheet with the headers above always works. Comma/tab/semicolon files, quoted fields, US and day-first
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
