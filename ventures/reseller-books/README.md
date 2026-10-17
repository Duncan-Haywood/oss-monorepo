# Reseller Books

A free browser tool for resellers who sell on more than one marketplace: **drop your eBay,
Etsy, Poshmark, Whatnot and Shopify reports together and get one monthly profit and loss, what each
channel really keeps of a sales dollar, and a Schedule C style worksheet for your tax
preparer.** Files are read in the browser; nothing is uploaded and no account access is needed.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/reseller-books/

After using this, you can now **see all your marketplaces in one set of books, compare what
eBay, Etsy, Poshmark, Whatnot and Shopify actually keep after fees, postage, ads and refunds, and hand
a preparer numbers already grouped by tax line**, which used to mean four exports, four
shapes and an afternoon in a spreadsheet.

## Input

Any mix of: the eBay Transaction report, the Etsy Payment Account statement (plus the Sold
Order Items file to cost Etsy sales), the Poshmark My Sales Report, the Whatnot orders export, the Shopify Payments Transactions export (plus the Shopify Orders export, which takes collected sales tax out of Shopify sales and costs products).
The channel is decided from the header row. **Column names are matched by alias from memory
of each export; no real exports were available.** Unrecognised files are named on the page.

## Model

`engines/*.mjs` are verbatim copies of the five analyzers' `calc.mjs` (so the venture deploys
alone); `books.mjs` puts their results in one ledger. Per month, channel and total:
`sales + refunds + deductions = net payout` (asserted in tests). Advertising is separated from
fees. Profit = net payout - cost, shown for a channel only when every sale on it has a cost.
eBay, Etsy and Shopify sales include shipping charged (Shopify's also include sales tax unless the Orders export is given, which removes it); Poshmark and Whatnot are read at item price.
The worksheet groups totals under Schedule C lines and says where placement is a preparer's
choice. Not tax advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
