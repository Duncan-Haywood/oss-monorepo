# eBay Transaction Report Analyzer

A free browser tool for eBay sellers: **drop in your Seller Hub Transaction
report and see where every sale went, and which items make money.** The file is
read in the browser; nothing is uploaded. Independent of eBay and not
affiliated with it.

After using this, you can now **see how much final value fees, Promoted
Listings, shipping labels and refunds actually take, the gap between shipping
buyers paid and labels you bought, and the profit per item once you enter your
costs**, which used to mean a hand-built pivot table or connecting a
third-party app to your eBay account.

## Input

- **Transaction report** (required): Seller Hub → Payments → Reports →
  Transaction report → Download CSV. Columns `Transaction creation date`,
  `Type`, `Order number`, `Net amount`, `Item ID`, `Item title`, `Custom label`,
  `Quantity`, `Item subtotal`, `Shipping and handling`, and the fee columns. The
  lines above the header are skipped.
- **Unit costs** (optional): `item title or custom label,cost` lines, or typed
  into the table.

Unreadable rows are listed with a line number and reason, never dropped
silently. Rows the tool does not recognise go to an "other" bucket.

## Model

Each row lands in exactly one bucket (sales, refunds, final value fees, other
per-order fees, Promoted Listings, insertion, subscription, labels, disputes,
tax and adjustments, other); payouts are excluded. Label, refund and ad rows are
tied to items through the order number and split by revenue. Not modelled: your
time, packaging, income tax, currency conversion, off-eBay sales.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
