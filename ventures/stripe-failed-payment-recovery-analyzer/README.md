# Stripe Failed Payment Recovery Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/stripe-failed-payment-recovery-analyzer/>

A free browser tool for subscription founders: **drop in a Stripe payments CSV
export and see how much failed-payment revenue you recover, how much you lose,
and which declines are fixable.** The file is read in the browser; nothing is
uploaded.

After using this, you can now **see your real recovery rate by decline reason,
how fast recoveries arrive, which lost revenue is an expired card versus a
temporary decline, and what a few more points of recovery are worth a year**,
which used to mean connecting a dunning vendor (Churnkey, Baremetrics Recover,
ProfitWell Retain) to your billing account or building a pivot table by hand.

## Input

Any CSV with a date, an amount, a status (Succeeded/Failed) and a customer or
invoice. Stripe's Payments export headers (`Created (UTC)`, `Amount`,
`Currency`, `Status`, `Customer ID`, `Invoice ID`, `Decline Reason`) are
recognised; near-synonyms work too. Unreadable rows are listed with a line
number and reason, never dropped silently.

## Model

A failed charge opens a case; the next success for the same invoice (or
customer) inside the window recovers it; otherwise it is lost. Failures younger
than the window are excluded from rates. Decline codes are grouped by action:
update the card, retry later, do not retry. See the page for the full list of
what is not modelled.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
