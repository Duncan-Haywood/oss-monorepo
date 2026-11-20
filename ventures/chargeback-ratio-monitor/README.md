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

## Network programmes (added 2026-11-20)

Besides your own lines, the report reads each brand in the latest month with
charges:

- **Visa VAMP (merchant):** (disputes + early fraud warnings) / Visa charges in
  the same month, against 1.5% from 1 April 2026 (2.2% before) and a minimum of
  1,500 fraud reports plus disputes.
- **Mastercard ECP:** chargebacks this month / Mastercard charges in the
  *previous* month; ECM at 1.5% and 100 chargebacks, HECM at 3.0% and 300.
- **Each brand against your lines:** a brand at your elevated or excessive line
  is a high finding even when the blended ratio is lower (the worked example:
  June is 1.09% blended, Mastercard alone 9 of 373 = 2.41%).
- A tick box counts early fraud warnings in the monthly ratio too.

## Known gaps

Fixed from the [2026-11-19 quality audit](../../portfolio/quality/audits/2026-11-19-chargeback-ratio-monitor.json):
the blended-only headline, the same-month Mastercard denominator, early fraud
warnings left out, and the missing minimum-count gate. Still open:

- Fraud warnings are placed in the charge month: Stripe's export has no
  warning date.
- Card-present and card-not-present charges are not told apart; VAMP counts
  card-not-present only.
- Regional variants of the programmes and an acquirer's own lines are not
  modelled.
- Non-ISO dates (`01/31/2026`) are read by the browser's own parser.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
