# Google Play Earnings Report Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/google-play-earnings-report-analyzer/>

A free browser tool for Android developers: **drop in your Google Play Console Earnings
report and see what each app and product really netted after Google's fee and refunds.**
The file is read in the browser; nothing is uploaded and no Play Console login or API
access is needed.

After using this, you can now **see net earnings by product, product type, country and
month, the effective Google fee overall and per product type (subscriptions near 15%,
apps and in-app near 30%), refunds netted out with a refund rate per product, the
three-month trend, and findings such as country or single-product concentration**, which
used to mean pivoting a transaction-level CSV by hand.

## Input

The Earnings report CSV from Play Console (Download reports, Financial): one row per
charge, Google fee, tax or refund, with `Amount (Merchant Currency)`. The older Estimated
sales report (`Financial Status`, `Charged Amount`) also works, with fees estimated at a
typed percentage and labelled as estimates. Several files can be chosen at once. **Column
names and transaction wording are matched by alias from memory of Play Console reports; no
real report was available.** Buyer city, postcode and order numbers are never read.

## Model

Net is the sum of merchant-currency amounts, each row signed by its direction. The
effective fee is Google fee rows over charges net of refunds. Groups under five charges
never drive a finding. A file that mixes merchant currencies uses the most common as base
and excludes (and names) the rest until a rate is typed. See the page for what is not
modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
