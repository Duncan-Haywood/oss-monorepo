# Chargeback Ratio Monitor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/chargeback-ratio-monitor/>

A free browser tool for online sellers and subscription businesses: **drop in a
Stripe payments CSV export and see your dispute ratio for every month, how many
more disputes you can take before each warning line, where the trend is
heading, and what is causing the disputes.** The file is read in the browser;
nothing is uploaded.

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
The trend is a straight line through the last three or four months. Disputes
are counted as opened: wins and losses are not in the export. Every table
reconciles to the same totals (a test asserts it).

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
