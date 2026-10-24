# App Store Sales Report Analyzer

A free browser tool for iOS developers: **drop in your App Store Connect Summary Sales
report and see what your apps earn after Apple's cut, by product, country and month.**
The file is read in the browser; nothing is uploaded and no App Store Connect login or
API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/app-store-sales-report-analyzer/

After using this, you can now **see net proceeds by product, type of sale, country and
month, refund rates by product, the share of the customer price you keep, subscription
units at the after-one-year rate, downloads against paid units, and whether your paid
sales show the Small Business Program rate**, which used to mean pivoting the report in
a spreadsheet and converting a handful of payout currencies by hand.

## Input

A Sales and Trends Summary Sales report (tab-separated text or CSV) with `Units` and
`Developer Proceeds` plus a `Title`, `SKU` or `Begin Date`. `Product Type Identifier`,
`Country Code`, `Currency of Proceeds`, `Customer Currency`, `Customer Price`,
`Proceeds Reason`, `Promo Code` and `Parent Identifier` are used when present.
**Column names are matched by alias from memory of Apple's report; no real report was
available.** Proceeds arrive in each storefront's payout currency, so totals use
exchange rates typed on the page; a currency with no rate is excluded and named.

## Model

Net proceeds are units times per-unit proceeds, so refunds (negative units) subtract.
The product, type, country, month and currency tables each reconcile to the same total.
The proceeds-to-price ratio only compares rows whose currencies match and includes tax,
so it is not the commission rate. Refund rates need at least five sold units to drive a
suggestion. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
