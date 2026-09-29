# Etsy Statement Analyzer

A free browser tool for Etsy sellers: **drop in your payment account statement
CSV and see what Etsy actually keeps.** The file is read in the browser; nothing
is uploaded. Independent of Etsy and not affiliated with it.

After using this, you can now **see your real take rate, what Offsite Ads, Etsy
Ads and refunds cost, and the fees on each listing**, which used to mean
connecting a seller-tools app to your shop, or adding up hundreds of statement
lines by hand.

## Input

Shop Manager → Finances → Payment account → Monthly statements → Download CSV.
Recognised columns: `Date`, `Type`, `Title`, `Info`, `Currency`, `Amount`,
`Fees & Taxes`, `Net`. Each row counts by its Net cell (Amount if there is no
Net column); `--` is an empty cell. Unreadable rows are listed with a line
number and reason, never dropped silently. Unit costs are optional: type them
per listing or paste `Listing title,cost` lines.

## Outputs

- Waterfall: sales → refunds → transaction, processing, listing, Offsite Ads,
  Etsy Ads, regulatory fees, credits → shipping labels → paid to you → cost of
  goods → profit.
- Take rate: Etsy's own charges over sales (labels shown separately).
- Fees by listing (single-item orders), with editable unit costs.
- Monthly table and CSV download of the listing table.
- Findings: take rate, Offsite Ads share, Etsy Ads share, small orders eaten by
  fixed fees, refund cost, regulatory fee, fee drift, loss-making listings.

## Model

Sales, refunds and each fee type are grouped by the row's Type and Title;
deposits to the bank are payouts and excluded; sales tax is excluded. Orders are
tied together by the order number in Title/Info. Per-listing figures use orders
with exactly one item, identified through the "Transaction fee: item" line.
Not modelled: materials, labour and packaging you have not entered, taxes,
currency conversion, anything outside the exported months.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
