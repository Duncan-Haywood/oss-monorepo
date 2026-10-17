# KDP Royalty Report Analyzer

A free browser tool for self-published authors: **drop in your KDP royalty report CSV and
see what each book, store and royalty option actually paid.** The file is read in the
browser; nothing is uploaded and no Amazon account access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/kdp-royalty-report-analyzer/

After using this, you can now **see net royalty per title, marketplace, royalty option and
month, refund rates, Kindle Unlimited pages read (valued at a rate you type), delivery and
printing costs, 35%-option sales priced inside the 70% range, and what your ad spend left**,
which used to mean building the pivot tables by hand.

## Input

Any CSV with a royalty and/or KENP-read column, ideally with Title, Royalty Date,
Marketplace, Royalty Type, Transaction Type, Units Sold, Units Refunded, Net Units Sold,
Avg. Offer Price, Avg. Delivery/Manufacturing Cost and Currency. **Column names are
matched by alias and were not checked against a live account; the assumed names are stated
on the page.** Save Excel reports as CSV first. Unreadable rows are listed with a line
number and reason.

## Model

Royalty is summed as the file states it (refund rows are negative). One currency is
analyzed at a time; nothing is converted. KENP pages are valued only at the per-page rate
you enter. The 70% band check is an estimate (70% of the offer price minus the row's
delivery cost) for 35% sales priced in a range you set; eligibility is Amazon's rule.
Ad spend is subtracted from royalty plus page-read value. See the page for what is not
modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
