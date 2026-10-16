# Amazon Seller Profit Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/amazon-seller-profit-analyzer/>

A free browser tool for Amazon sellers: **drop in the Seller Central
Transaction report CSV and see profit per SKU.** The file is read in the
browser; nothing is uploaded. Independent of Amazon and not affiliated with it.

After using this, you can now **see which SKUs make money after referral fees,
FBA fees, refunds, ads and storage, and how much of each sale Amazon keeps**,
which used to mean paying a seller-tools vendor for access to your account, or
building a pivot table on a 30-column export by hand.

## Input

Seller Central → Reports → Payments → Date Range Reports → Transaction CSV.
Recognised columns: `date/time`, `type`, `order id`, `sku`, `description`,
`quantity`, `fulfillment`, `product sales`, `shipping credits`, `gift wrap
credits`, `promotional rebates`, `selling fees`, `fba fees`, `other transaction
fees`, `other`, `total`. Summary lines above the header are skipped. Unreadable
rows are listed with a line number and reason, never dropped silently. Unit
costs are optional: type them per SKU or paste `SKU,cost` lines.

## Outputs

- Waterfall: sales → promotions → referral → FBA → refunds → ads, subscription,
  storage, reimbursements → paid out → cost of goods → profit.
- Per-SKU table: units, refund rate, sales, fees, what Amazon paid, profit,
  margin (editable unit costs, live update).
- Monthly table.
- Findings: ad share of sales, loss-making and thin-margin SKUs, refund-heavy
  SKUs, referral fees Amazon kept on refunds, reimbursements received (or
  none), storage share, fee-rate drift, profit concentration.
- Download of the SKU table as CSV.

## Model (stated so you can disagree with it)

Per-SKU "Amazon paid you" is the sum of the file's `total` column over that
SKU's Order and Refund rows, so it reconciles to the report. Profit subtracts
unit cost × net units (or all units, if refunded units are not restocked); a
SKU with no cost shows no profit rather than counting as free. Rows not tied to
a sale are grouped by description (ads, subscription, storage/inventory,
claims, reimbursements); transfers are payouts and are excluded. Not modelled:
inbound freight, prep, packaging, taxes, returns not yet processed, fees
outside the period, currency conversion.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
