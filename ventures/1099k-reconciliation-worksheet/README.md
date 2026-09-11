# 1099-K Reconciliation Worksheet

A free browser worksheet for gig and marketplace sellers — Etsy, eBay,
Poshmark, Mercari, Depop, Whatnot, StockX, or any other marketplace or
payment app — that reconciles one or more Form 1099-K Box 1a gross-payment
totals down to an estimated net taxable profit. Enter each platform's Box
1a figure, back out refunds and any sales tax the marketplace collected and
remitted on your behalf, subtract your own costs, and see a per-platform
and combined result. Entirely client-side; nothing is uploaded.

After using this, you can now **see what each 1099-K's gross figure
actually reconciles to as net profit, per platform and combined**, which
used to mean either guessing, overpaying tax on the raw gross amount, or
redoing the same subtraction by hand for every marketplace separately.

## Why this exists

Form 1099-K Box 1a is a **gross** figure. The IRS's own General
Instructions for Forms 1099-K define it as the gross amount of reportable
transactions "without regard to any adjustments for credits, cash
equivalents, discounts, fees, refunds, or other amounts" — and under
marketplace-facilitator laws now in effect everywhere that levies sales
tax, a large marketplace also collects and remits sales tax on a seller's
behalf, money that commonly still counts toward that same gross total even
though it was never the seller's income. Neither of those is a matter of
opinion; both are structural facts about how the form is defined and how
marketplaces report.

The result: sellers open a January 1099-K and see a number thousands of
dollars higher than what they actually made, with no reconciliation
provided anywhere on the form itself — a genuinely confusing, recurring
experience discussed every filing season across seller communities (see
`VENTURE.yaml` for the named channels).

## Try it

Open [`index.html`](index.html), add a row per 1099-K you received (or
click **Load an example**), and see the reconciled result update per row
and combined across every platform. Export the worksheet as a CSV to keep
or hand to whoever prepares your return.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions with no dependencies:

- **`reconcileRow`** — for one platform: backs Box 1a down to an adjusted
  gross receipts figure (subtracting refunds and marketplace-remitted
  sales tax), then subtracts costs (fees, cost of goods sold, shipping) to
  estimate net profit. Raises a high-severity finding if the entered
  adjustments exceed Box 1a (a data-entry check), a medium finding if
  non-income adjustments are an unusually large share of Box 1a, and an
  info finding if the platform shows an estimated loss.
- **`reconcileAll`** — reconciles every row, totals the result, and always
  raises a "this is a worksheet, not a filing" disclosure on any non-empty
  worksheet — the same always-on-disclosure pattern this portfolio's
  `quarterly-estimated-tax-calendar` uses, so the output can never be
  mistaken for a completed determination.
- **`toCsv`** — the reconciled worksheet as an exportable CSV.

Every output is a **reconciliation worksheet to verify, never a filed
amount or a determination of the filer's actual tax liability** — the
user remains the filer and the decision-maker.

## Disclaimers

This is not tax, legal, or financial advice, and it does not replace a
qualified tax professional. Verify every figure against the platform's own
1099-K and payout statements before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`row_added`, `row_removed`, `csv_exported`, `example_loaded`) are counted
in `localStorage` only, never transmitted, never tied to your identity. Do
Not Track and Global Privacy Control are honoured, and a button on the page
turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The reconciliation
arithmetic and CSV export are done and tested; no external user contact has
happened yet — see `kill_criteria` in `VENTURE.yaml`.
