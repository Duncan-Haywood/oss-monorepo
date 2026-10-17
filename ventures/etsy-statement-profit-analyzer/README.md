# Etsy Statement Profit Analyzer

A free browser tool for Etsy sellers: **drop in your Payment Account statement
(and Sold Order Items) and see where every sale went, and which listings make
money.** The files are read in the browser; nothing is uploaded. Independent of
Etsy and not affiliated with it.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/etsy-statement-profit-analyzer/

After using this, you can now **see how much Etsy, Offsite Ads, Etsy Ads,
renewals, labels and refunds actually take, and the profit per listing once you
enter your costs**, which used to mean a hand-built pivot table or connecting
a third-party app to your shop.

## Input

- **Statement** (required): Shop Manager → Finances → Payment account →
  Download. Columns `Date`, `Type`, `Title`, `Info`, `Amount`, `Fees & Taxes`,
  `Net` (Net is rebuilt from Amount + Fees & Taxes when absent).
- **Sold Order Items** (optional): Shop Manager → Settings → Options →
  Download Data. Columns `Item Name`, `Order ID`, `Quantity`, `Price`,
  `Discount Amount`.
- **Unit costs** (optional): `listing name,cost` lines or typed into the table.

Unreadable rows are listed with a line number and reason, never dropped
silently. Statement rows the tool does not recognise go to an "other" bucket so
they stay visible.

## Model

Each statement row lands in exactly one bucket (sale, refund, transaction,
processing, listing/renewal, Offsite Ads, Etsy Ads, regulatory, subscription,
labels, credit, other); deposits are payouts and excluded. Per listing, each
order's net (found by the order number in Title or Info) is split across the
order's items by revenue; costs not tied to an order stay at shop level. The
take rate excludes shipping labels. Not modelled: your time, packaging, taxes,
currency conversion, off-Etsy sales.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
