# Reseller Books

A free browser tool for resellers who sell on more than one marketplace: **drop your eBay,
Etsy, Poshmark, Mercari, Whatnot and Shopify reports together and get one monthly profit and loss, what each
channel really keeps of a sales dollar, and a Schedule C style worksheet for your tax
preparer.** Files are read in the browser; nothing is uploaded and no account access is needed.

**Live page:** https://marisstella.app/reseller-books/

After using this, you can now **see all your marketplaces in one set of books, compare what
eBay, Etsy, Poshmark, Mercari, Whatnot and Shopify actually keep after fees, postage, ads and refunds, and hand
a preparer numbers already grouped by tax line**, which used to mean four exports, four
shapes and an afternoon in a spreadsheet.

## Input

Any mix of: the eBay Transaction report, the Etsy Payment Account statement (plus the Sold
Order Items file to cost Etsy sales), the Poshmark My Sales Report, the Mercari Gross Sales Report, the Whatnot orders export, the Shopify Payments Transactions export (plus the Shopify Orders export, which takes collected sales tax out of Shopify sales and costs products).
The channel is decided from the header row. **Column names are matched by alias from memory
of each export; no real exports were available.** Unrecognised files are named on the page.
The Mercari reader is the exception: its 20 field names are the ones Mercari's help centre lists for the
Gross Sales Report (mercari.com/us/help_center/article/541, read 2026-11-24), though no real file has been read yet.

Optionally, a **mileage log**: any CSV with a date and a miles (or odometer start and end) column, including the
`mileage-log` venture's own export. Business trips go on Schedule C line 9 at the IRS standard rate (see Model).

## Model

`engines/*.mjs` are verbatim copies of the five analyzers' `calc.mjs` (so the venture deploys
alone), except `engines/mercari.mjs`, which has no single-channel analyzer and lives here; `books.mjs` puts their results in one ledger. Per month, channel and total:
`sales + refunds + deductions = net payout` (asserted in tests). Advertising is separated from
fees. Profit = net payout - cost, shown for a channel only when every sale on it has a cost.
eBay, Etsy and Shopify sales include shipping charged (Shopify's also include sales tax unless the Orders export is given, which removes it); Poshmark, Mercari and Whatnot are read at item price.
Mercari: only Completed orders are booked, in their completion month, because fees on an in-progress order are
estimates; canceled and in-progress orders are counted in a note. Buyer-paid shipping, sales tax and buyer fees
never reach the seller, so they are reported beside the books, not in sales. Overlapping downloads are
de-duplicated by Item ID (the later status wins), and a row whose fees do not add up to its Net Seller Proceeds
keeps the file's net and is flagged.
Mileage (`trips.mjs`, rates from `engines/mileage.mjs`, a verbatim copy of `mileage-log/calc.mjs`): business trips are
priced at the IRS standard mileage rate for each trip's date (70c 2025, Notice 2025-5; 72.5c Jan 1 to Jun 30 2026,
Notice 2026-10; 76c from Jul 1 2026, Announcement 2026-11; verified against irs.gov on 2026-09-29), plus business
tolls and parking, as Schedule C line 9; business, commuting and other miles are given for Part IV. A log with no
category column is all business; with one, only rows marked business (or sourcing, work, shipping, post office)
are deducted. A row repeated across two files counts once; identical rows within one file all count. Trips before
2025 are left out and trips after 2026 are flagged. Mileage is kept out of the marketplace reconciliation.
The worksheet groups totals under Schedule C lines and says where placement is a preparer's
choice. Not tax advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
