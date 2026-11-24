---
title: "Reading Mercari's Gross Sales Report for your books: what counts as sales and what doesn't"
seo_title: "Mercari Gross Sales Report: what counts as your sales"
date: 2026-11-24
tags: [resellers, mercari, bookkeeping, schedule-c]
description: "Mercari's report has 20 fields, and six of them are money the buyer paid that never reaches you. How Reseller Books now reads it beside eBay, Poshmark and Etsy."
---

[Reseller Books](../../ventures/reseller-books/) puts a reseller's
marketplace reports into one monthly profit and loss. Until today it read
eBay, Etsy, Poshmark, Whatnot and Shopify. Mercari, a resale marketplace
many US resellers list on beside the others, was missing. It is in now, and its
report needs more care than its column names suggest.

## The report, from Mercari's own field list

The other readers match column names by alias, from memory of each
export. This one does not have to. Mercari's help centre lists every field
of the Gross Sales Report and says what each one means
([How to access my Gross Sales Report](https://www.mercari.com/us/help_center/article/541),
read 2026-11-24). There are 20 fields, and they fall into four groups:

- **Who and when:** Item ID, Sold Date, Canceled Date, Completed Date, Item
  Title, Order Status, Shipped to State, Shipped from State.
- **What you were paid:** Item Price, and Net Seller Proceeds, which is the
  item price less the next group.
- **What comes off it:** Seller Shipping Fee, Mercari Selling Fee, Payment
  Processing Fee, Shipping Adjustment Fee (the extra charged for an
  underweight label).
- **What the buyer paid on top:** Buyer Shipping Fee, Sales Tax Charged to
  Buyer, Merchant Fees Charged to Buyer, Service Fee Charged to Buyer,
  Buyer Protection Charged to Buyer and Payment Processing Fee Charged to
  Buyer.

That last group is the trap. Six of the twenty fields are money that
passed through the order but never reached the seller. Mercari remits the
sales tax itself under marketplace facilitator rules. The buyer-paid fees
are Mercari's. Buyer-paid shipping pays for the label. Add a column of those
to your sales and you overstate gross receipts on every order.

## How the books read it

- **Sales are the item price of completed orders.** The help centre says
  the status is the one on the day the report is made, and that fees on an
  order still in progress are estimates. So an in-progress order is counted
  and named but not booked. A later report that shows it completed books it.
- **A sale lands in its completion month,** because that is when Mercari
  adds the proceeds to your balance. With no completion date, the sold date
  is used.
- **Deductions add up to Net Seller Proceeds.** Selling and processing fees
  go to *commissions and fees*, seller-paid shipping to *postage*, the
  shipping adjustment to *other*. If a row's fees don't explain its net, the
  file's net is kept, the difference goes to *other*, and the row is flagged.
- **Buyer-paid amounts are totalled beside the books,** not in them. A Form
  1099-K can include some of them, so the page reports the figure for
  checking against the form. Mercari's help centre says, for example, that
  the 2024 buyer service and buyer protection fees are not in the 2024
  1099-K gross amount.
- **Overlapping downloads count a sale once.** The Item ID is unique, so a
  March-to-May report and an April-to-June report dropped together book
  each sale once. Where the same item shows two statuses, the settled one
  (completed or canceled) wins over in-progress.

The de-duplication test found a real bug on its first run. The lookup
asked `if (!seen)`, and the first row of a file sits at index 0, which is
falsy. That one row was never matched, so it would have been counted
twice. A one-line fix (`seen === undefined`), and the test that caught it
stays in the suite.

## What isn't known yet

No real Mercari export has been read. The field names come from Mercari's
documentation, but the exact spelling, date format and number format of a
downloaded file are matched loosely and may still differ. If yours doesn't
load, the page names the file and says why.

Depop is the other marketplace sellers ask about, and it stays out for now.
Its sales CSV is real (Selling Hub, three months a file), but no public page
lists its column names. A reader written from guesses would get money wrong.

## Why this matters for the paid product

Reseller Books is the free edition of a planned subscription, Seller Books,
whose first milestone is exactly this: payout files from eBay, Poshmark,
Mercari, Whatnot and Depop in one ledger, de-duplicated across re-uploads.
The engine written here is the one that product will import.

*Arithmetic on your files, not tax advice. Mercari is a trademark of its
owner; this tool is independent and not affiliated with it.*
