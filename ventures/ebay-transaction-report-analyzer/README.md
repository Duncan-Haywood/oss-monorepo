# eBay Transaction Report Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ebay-transaction-report-analyzer/>

A free browser tool for eBay sellers: **drop in your Seller Hub Transaction
report and see where every sale went, and which items make money.** The file is
read in the browser; nothing is uploaded. Independent of eBay and not
affiliated with it.

After using this, you can now **see what final value fees, Promoted Listings,
international and performance fees, refunds and under-charged shipping actually
cost, and the profit per item once you enter what each one cost you**, which
used to mean a hand-built pivot table or connecting a third-party app to your
seller account.

## Input

- **Transaction report** (required): Seller Hub → Reports → Downloads →
  Transaction report. Columns matched by name: `Transaction creation date`,
  `Type`, `Order number`, `Net amount`, `Item ID`, `Item title`, `Custom label`,
  `Quantity`, `Item subtotal`, `Shipping and handling`, the fee columns
  (`Final Value Fee - fixed`/`variable`, `Very high "not as described" fee`,
  `Below standard performance fee`, `International fee`) and `Description`.
  The metadata lines above the header row are skipped.
- **Unit costs** (optional): `item title (or custom label / item number),cost`
  lines, or typed into the table.

Unreadable rows are listed with a line number and reason, never dropped
silently. Rows the tool does not recognise go to an "other" bucket, and any
amount the fee columns do not explain (seller-collected tax, rounding) is an
explicit "adjustments" line, so the waterfall always ties to `Net amount`.

## Model

Each row lands in exactly one bucket (sale, refund, final value fee,
international, performance, Promoted Listings, listing, subscription, disputes,
labels, credit, other); payouts and transfers are excluded. Per item, each
order's net is split across its items by what the buyer paid, joined on the
order number; charges with no order number stay at store level. The take rate
excludes shipping labels and disputes. Not modelled: your time, packaging, income
tax, labels bought outside eBay, currency conversion, other sales channels.

Column names and row types were written from eBay's documented export layout,
not from a live account (see `VENTURE.yaml`).

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).
