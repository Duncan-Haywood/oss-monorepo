# Shopify Payments Fee Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-payments-fee-analyzer/>

A free browser tool for Shopify merchants: **drop in your Payments Transactions
export and see what Shopify Payments really costs you, and why.** The file is
read in the browser; nothing is uploaded. Independent of Shopify and not
affiliated with it.

After using this, you can now **see your effective fee rate by card brand, card
source (domestic, international, wallets) and payment method, what refunds and
chargebacks cost in fees you do not get back, and what a different rate would
save**, which used to mean a hand-built pivot table over a CSV.

## Input

Shopify admin → Finances → Payouts → Transactions → Export (CSV). Columns
`Transaction Date`, `Type`, `Order`, `Card Brand`, `Card Source`, `Amount`,
`Fee`, `Net`, `Payment Method Name`, `Presentment Currency`, `Currency` are
matched case-insensitively with aliases; other columns are ignored. Fee is
recovered as Amount minus Net, so the sign convention of the file does not
matter.

Unreadable rows are listed with a line number and reason, never dropped
silently. Types the tool does not recognise go to an "other" bucket.

## Model

Each row lands in exactly one bucket (charge, refund, dispute, dispute won,
adjustment, reserve, other, payout); payouts are excluded from fees. The
effective rate is fees on charges over charge amount. Refund cost is the fee on
the refunded share of the original charge (matched by order number) that was not
returned. The foreign-currency premium is the rate gap between charges presented
in another currency and same-currency charges in the same file. What-ifs take
rates you type; they are not Shopify's current rates. Not modelled: plan price,
third-party gateway and app fees, taxes, shipping labels, cost of goods.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
