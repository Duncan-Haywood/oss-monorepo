# Chargeback Ratio Monitor

A free browser tool for online sellers and subscription businesses: **drop in a
Stripe payments CSV export and see your dispute ratio for every month, how many
more disputes you can take before each warning line, where the trend is
heading, and what is causing the disputes.** The file is read in the browser;
nothing is uploaded.

**Live tool:** https://marisstella.app/chargeback-ratio-monitor/

After using this, you can now **see how close you are to your payment
provider's dispute limits, how many extra sales or fewer disputes it takes to
get back under, which dispute reasons and card brands drive the ratio, and
which customers disputed twice**, which used to mean a paid chargeback-alert
service or a pivot table built by hand.

## Input

Any CSV with a date, an amount, a status and a dispute column. Stripe's
Payments export headers (`Created (UTC)`, `Amount`, `Currency`, `Status`,
`Card Brand`, `Disputed Amount`, `Dispute Date (UTC)`, `Dispute Reason`,
`Customer ID`) are recognised; near-synonyms work too. Unreadable rows are
listed with a line number and reason, never dropped silently.

## Model

Ratio = disputes opened in a month / settled charges made in that month. The
watch, elevated and excessive lines are editable starting points, not any card
network's or provider's rules; replace them with the figures you are quoted.
The trend is the average month-over-month change between the first and last of the last three or four months with sales (the end points only, not a fitted line). Disputes
are counted as opened: wins and losses are not in the export. Every table
reconciles to the same totals (a test asserts it).

## Known gaps (quality audit 2026-11-19)

From [`portfolio/quality/audits/2026-11-19-chargeback-ratio-monitor.json`](../../portfolio/quality/audits/2026-11-19-chargeback-ratio-monitor.json):

- **The headline ratio blends every card brand.** Visa VAMP and Mastercard's
  Excessive Chargeback Program are each measured per brand. In the sample
  file June is 1.09% overall while Mastercard alone is 9 of 373 (2.41%).
  The by-brand table shows totals, not a per-brand month.
- **Same-month denominator only.** Mastercard divides a month's chargebacks
  by the *previous* month's transactions; the tool always uses the same month.
- **Early fraud warnings are not in the ratio.** VAMP counts TC40 fraud
  reports alongside disputes.
- **No minimum-count gate.** Network programmes also require a minimum
  number of disputes (e.g. 100 for Mastercard ECM) before a ratio counts.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
