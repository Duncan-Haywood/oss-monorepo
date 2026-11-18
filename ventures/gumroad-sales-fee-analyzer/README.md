# Gumroad Sales Fee Analyzer

A free browser tool for Gumroad sellers: **drop in your sales CSV and see
what you actually take home.** The file is read in the browser; nothing is uploaded and
no Gumroad account access is needed.

**Live tool:** https://marisstella.app/gumroad-sales-fee-analyzer/

After using this, you can now **see the service fee Gumroad actually took (observed, not
assumed), your take-home per order, net revenue per product and per buyer, repeat-buyer
share, refunds and cancellations, withdrawal costs, funds still clearing, and the price
to charge for a target take-home**, which used to mean building the pivot table by hand.

## Input

**Gumroad's sales export, as it comes.** Its headers (`Sale Price ($)`, `Fees ($)`,
`Net Total ($)`, `Refunded?`, `Partial Refund ($)`, `Fully Refunded?`, `Disputed?`,
`Dispute Won?`, `Discover?`) were checked on 2026-11-15 against `PURCHASE_FIELDS` in
Gumroad's open-source `app/services/exports/purchase_export_service.rb`
(antiwork/gumroad); the `Totals` row is skipped and the `State` address column is not
read as a status. Any other CSV with an amount also works: `Amount`/`Price` (before
fee) and/or `Earnings`/`Net` (what you keep), with `Date`, `Type`, `Status`, `Product`,
`Buyer`, `Service fee` and `Hours` matched by alias. Comma/tab/semicolon files, quoted
fields, US and day-first dates and UTF-16 exports are read. Unreadable rows are listed
with a line number and reason.

## Model

Fee rate is fees over order value from the file's fee column or amount minus earnings;
Gumroad's standard schedule (12.9% + $0.80 per direct sale, a flat 30% on a Discover
sale, from `calculate_fees` in Gumroad's `app/models/purchase.rb`) is used only when the
file has neither, and the page says so; the observed rate is shown next to what the
schedule would have charged. Refund and lost-dispute flags take back the refunded share
of net (Gumroad returns its fee pro rata).
Take-home is net order and tip revenue minus refunds, your cost per order and withdrawal
fees. Hours (optional, yours) enable a take-home-per-hour ranking; the tool never guesses
them. Break-even price is (target + cost + fixed fee) / (1 - percentage fee), with the
percentage observed in the file after the fixed fee comes off each direct sale; also shown
adjusted for your refund rate. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test '*.test.mjs'`. The 2026-11-15 quality audit
([`portfolio/quality/audits/2026-11-15-gumroad-sales-fee-analyzer.json`](../../portfolio/quality/audits/2026-11-15-gumroad-sales-fee-analyzer.json))
found the tool could not read Gumroad's real export and assumed a flat 20% fee; both are fixed.
