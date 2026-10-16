# Shopify Payout Profit Analyzer

A free browser tool for Shopify merchants: **drop in your Shopify Payments
Transactions export (and the Orders export) and see where every payout went,
and which products make money.** The files are read in the browser; nothing is
uploaded. Independent of Shopify and not affiliated with it.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/shopify-payout-profit-analyzer/

After using this, you can now **see how much processing fees, third-party
gateway fees, refunds, chargebacks and dispute fees actually take, the
effective fee rate by card, what discount codes cost, and profit per product
once you enter your unit costs**, which used to mean a hand-built pivot table
or connecting a profit-analytics app to your store.

## Input

- **Transactions** (required): Shopify admin → Finances → Shopify Payments →
  Transactions → Export. Columns `Transaction Date`, `Type`, `Order`,
  `Card Brand`, `Card Source`, `Payout Status`, `Amount`, `Fee`, `Net`,
  `Payment Method Name`, `Presentment Currency`, `Currency` (Net is rebuilt
  from Amount - Fee when absent).
- **Orders** (optional): Orders → Export → CSV. Columns `Name`, `Taxes`,
  `Total`, `Discount Code`, `Discount Amount`, `Payment Method`,
  `Lineitem quantity/name/price/sku`. Extra line rows of a multi-item order
  carry only the name; order-level fields come from the row that has them.
- **Unit costs** (optional): `product name,cost` (or `sku,cost`) lines, or typed
  into the table.
- **Third-party fee rate** (optional): shows an estimate for orders paid
  through another gateway; never added to the waterfall.

Unreadable rows are listed with file, line number and reason, never dropped
silently. Transaction types the tool does not recognise go to an "other"
bucket so they stay visible.

## Model

Each non-payout row's Net is split into an amount line (charges, refunds,
chargebacks, adjustments, other) and a fee line (processing, dispute fees), so
the waterfall sums exactly to the Net column; payouts only move counted money
and are shown separately. Per order, net to bank sums everything sharing the
order name. Per product, each order's net less reported sales tax is split
across its line items by price after the order's discount. Not modelled: your
time, shipping you pay, packaging, plan and app fees, ad spend, income tax,
currency effects on your bank account.

Column and type matching was written from Shopify's documented export
layouts and synthetic fixtures, not from a live shop.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
