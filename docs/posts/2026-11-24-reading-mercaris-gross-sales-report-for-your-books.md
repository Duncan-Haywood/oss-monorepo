---
title: "Reading Mercari, Depop and Whatnot sales reports for your books: what counts as sales and what doesn't"
seo_title: "Mercari, Depop and Whatnot sales reports: what counts as sales"
date: 2026-11-24
tags: [resellers, mercari, depop, whatnot, bookkeeping, schedule-c, reseller-books, for-customers]
description: "Mercari's report has six fields of money the buyer paid; Depop's has 34 columns and no payout; Whatnot's puts refunds on their own rows. How Reseller Books reads all three."
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

## Whatnot's weekly orders report, added 2026-11-26

Whatnot sends one CSV a week (Seller Hub > Financials > Statements), and
its help centre now defines every column of it
([Seller Weekly Orders Report](https://help.whatnot.com/hc/en-us/articles/36772664621837-Seller-Weekly-Orders-Report),
"Metric Definitions", read 2026-11-26). Before that, the reader used
names remembered from other Whatnot exports, such as `Sold Price`, `Order Date`
and `Net Earnings`. None of the real report's date or payout columns has
those names, so the weekly report was not read at all. It is read now.
Four things in Whatnot's definitions change your books:

- **One row is one transaction, not one sale.** Each row has a
  `Transaction Type`: `Order Earnings`, `Order Refund`, `Tips` or
  `Shipping Charge`. A refund is a second row with the same `Order ID`, in
  the week it completed, which can be a different week (and file) from the
  sale. Reseller Books takes each refund off the sale it belongs to, across
  all the weekly files you load. If the sale is in none of them, the page
  says how much was left out and which week to add.
- **`Shipping Fee` is what you paid, not what the buyer paid.** In this
  report it is seller-paid shipping, giveaway shipping included. The buyer's
  shipping and tax are in `Buyer Paid`, which Whatnot collects and spends
  itself. A reader that treats `Shipping Fee` as shipping income gets the
  direction of the money wrong.
- **The price is after your coupons.** `Post Coupon Price` is the sale price
  after your own coupons, and it is the amount commission is charged on.
  `Original Item Price` is before them.
- **Dates are UTC, and by completion.** `Transaction Completed at UTC` is
  when the money reached your balance, and Whatnot's monthly statements count
  a transaction in the month it completed
  ([Ledger](https://help.whatnot.com/hc/en-us/articles/44413003987981)).
  A sale completed at 02:00 UTC on 1 March was the evening of 28 February
  in the US, and it is in March's books.

A giveaway sells for nothing and still costs its label, so it is kept as a
$0 sale with its shipping as the loss. A Whatnot show that ran three
giveaways should show that cost. Whatnot also charges sales tax on its
commission and processing fees in some places (`Tax on Commission`,
`Tax on Payment Processing Fee`); both count as part of what Whatnot took.

Seller Books, the paid edition, got the same fix the same day, with the
`Ledger Transaction ID` as the key that stops a re-uploaded week from
counting twice. The caveat is the same as for the other two marketplaces:
the column list is Whatnot's own, but no real Whatnot file has been read
here yet. The timestamp format and the spelling of the type values are
still unconfirmed, so the reader ignores case and punctuation in both.

## Why this matters for the paid product

Reseller Books is the free edition of a planned subscription, Seller Books,
whose first milestone is exactly this: payout files from eBay, Poshmark,
Mercari, Whatnot and Depop in one ledger, de-duplicated across re-uploads.
With Depop in, the free edition now reads every marketplace on that list.

*Arithmetic on your files, not tax advice. Mercari, Depop and Whatnot are
trademarks of their owners; this tool is independent and not affiliated with
any of them.*
