# Poshmark Sales Report Analyzer

A free browser tool for Poshmark sellers: **load your My Sales Report CSV and see which
items and brands actually make money.** The file is read in the browser; nothing is
uploaded and no Poshmark account access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/poshmark-sales-report-analyzer/

After using this, you can now **see profit per item, per brand and per month after
Poshmark's fee (flat $2.95 under $15, 20% at $15 or more), the effective fee rate, cost per
SKU, shipping discounts and losses, days to sell, your worst and best items and the brands
to stop sourcing**, and copy a plain-text summary, which used to mean building the pivot
table by hand or trusting the payout total alone.

## Input

Any CSV with an `Order Date` (or `Sale Date`) and a sale price (`Order Price` or `Sale
Price`). `Brand`, `Listing Title`, `SKU`, `Order ID`, `Poshmark Fee`, `Net Earnings`,
`Seller Shipping Discount`, `Listed Date`, a `Cost` column and `Status` are used when
present. **Column names are matched by alias from memory of Poshmark's export; no real
export was available.** If a real "My Sales Report" is not read, the page lists the rows it
skipped and why, and a sheet with the headers above always works; that report is the
priority fix. Comma/tab/semicolon files, quoted fields, US and day-first dates and UTF-16
exports are read.

## Model

Fee: the file's fee column, otherwise the published US schedule (`COMMISSION_THRESHOLD`,
`FLAT_FEE`, `PERCENT_RATE`, the same constants as `../poshmark-fee-calculator`; a test
asserts they stay equal). Payout: the net earnings column when present, otherwise price
minus fee minus any seller shipping discount; a gap between price minus fee and net
earnings is counted as a shipping deduction. Profit: payout minus cost, where cost is a
file column or pasted `SKU,cost` pairs (pasted wins; matched by SKU, then order ID, then
exact title). Sales with no cost are excluded from profit and brand verdicts, and the page
says so. Brands to stop sourcing: at least three costed sales and a negative total. Cancelled,
returned and refunded orders are left out and counted.

## Run

Open `index.html` through any static server. Tests: `node --test`.
