---
title: "Reading Mercari and Depop sales reports for your books: what counts as sales and what doesn't"
seo_title: "Mercari and Depop sales reports: what counts as your sales"
date: 2026-11-24
tags: [resellers, mercari, depop, bookkeeping, schedule-c, reseller-books, for-customers]
description: "Mercari's report has 20 fields, and six of them are money the buyer paid that never reaches you. Depop's has 34 and no payout column. How Reseller Books reads both beside eBay, Poshmark and Etsy."
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

## Depop, added 2026-11-25

Depop was left out when this post was first written, because no public page
lists the columns of its sales file (Selling Hub, Stats, Download sales,
three months a file). Depop's help centre says what the file contains, not
what its headers are called. A reader written from guesses would get money
wrong, so we waited for evidence.

The evidence turned up in open-source code. A search of public GitHub code
found four independent projects that read real Depop exports: a sales
dashboard, a Power BI pipeline, a popularity-stats server and an analysis
notebook that prints a real file's header row. All four use the same names,
and the notebook prints all 34 of them: `Date of sale`, `Time of sale`,
`Date of listing`, `Bundle`, `Buyer`, `Brand`, `Description`, `Size`,
`Item price`, `Buyer shipping cost`, `Total`, `USPS Cost`, `Depop fee`,
`Depop Payments fee`, `Buyer Marketplace Fee`, `Boosting fee`, `Payment type`,
two payout dates, `Category`, six columns of the buyer's name and address,
`US Sales tax`, `Refunded to buyer amount`, `Fees refunded to seller`,
`Payout id` and three more tax columns. Reseller Books recognises that header
row, and a test checks it against the printed one.

What the books do with it:

- **Sales are the item price plus the shipping the buyer paid.** On Depop
  the buyer's shipping is credited to you and the label is then deducted as
  `USPS Cost`, the same shape as eBay's report. That is different from
  Mercari, where the buyer's shipping goes straight to the label.
- **The file has no payout per sale.** Mercari gives Net Seller Proceeds and
  Poshmark gives earnings; Depop gives neither. So the net here is worked
  out: item price plus buyer shipping, less the label, `Depop fee`,
  `Depop Payments fee` and `Boosting fee`, less refunds, plus any fees Depop
  gave back on a refund. The page says so and asks you to check it against
  your payouts. `Total` is not used, because some exports fold US sales tax
  into it.
- **Boosting is advertising, not a fee.** It goes on Schedule C line 8 with
  eBay's promoted listings and Etsy ads, not line 10.
- **The buyer's sales tax and Buyer Marketplace Fee are not your sales.**
  They are totalled beside the books, as on Mercari, because a 1099-K can
  include them.
- **Overlapping downloads count a sale once.** A year takes four files, and
  their ranges often overlap. With no item ID, a sale is matched on date,
  time, buyer, description and price. Two identical rows in one file both
  count, because a bundle can hold two of the same item.
- **Empty money cells are written `="-"`.** That is Excel's text-forcing
  wrapper, visible in two of the projects' code. It is read as zero, not as
  an unreadable row. Dates are read day first when the file shows it, as UK
  exports do.
- **Buyer names and addresses are never read.** They are in the file. The
  books don't need them, and a test checks that they never reach the output.

In the made-up sample file, three sales, one of them refunded in full, come
to $130.00 of sales (items plus buyer shipping) and a $72.97 net. That is
56.1% of each sales dollar, after $17.00 of labels, $6.00 of boosting, $4.03
of fees net of a $1.61 fee refund, and the $30.00 refund. The refunded
sweater still cost its $5.25 label and $2.40 boost, which is the kind of
loss a payout-only view hides.

The same caveat as Mercari's applies, and more strongly: no real Depop
export has been read by this repository. Four projects agreeing on a header
is good evidence, but it is not Depop's documentation. If your file doesn't
load, the page names it and says why.

## Why this matters for the paid product

Reseller Books is the free edition of a planned subscription, Seller Books,
whose first milestone is exactly this: payout files from eBay, Poshmark,
Mercari, Whatnot and Depop in one ledger, de-duplicated across re-uploads.
With Depop in, the free edition now reads every marketplace on that list.

*Arithmetic on your files, not tax advice. Mercari and Depop are trademarks
of their owners; this tool is independent and not affiliated with either.*
