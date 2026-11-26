---
title: "Resellers: from marketplace payout to Schedule C in three steps"
seo_title: "Reseller payouts, cost of goods and Schedule C"
date: 2026-11-24
tags: [resellers, ebay, schedule-c, bookkeeping, marketplace-fees, reseller-books, for-customers]
description: "Three new guides for multi-platform resellers: bridge a payout back to sales, cost a mixed lot by resale value, and map the year onto Schedule C."
---

A marketplace fee calculator answers one question: what does this sale pay
out? The ten seller tools in this repository (eBay, Etsy, Poshmark, Mercari,
Depop, Whatnot, Grailed, Facebook Marketplace, StockX and TikTok Shop) answer
it well. The question a reseller faces at tax time is different: what did I
*earn*, across every platform, for the year? That needs three things the
calculators don't do, so we wrote them up as guides, with worked numbers
that a test checks.

**1. Reconcile each payout back to sales.** In the worked month on eBay,
$1,350.00 of sales (items plus buyer-paid shipping) became a $923.68 bank
deposit. The bridge between them: $189.32 of final value fees after the
credit on one refund, $12.00 of per-order fees, $40.00 of Promoted Listings,
$135.00 of labels and a $50.00 refund. The $96.00 of sales tax eBay collected
never reached the seller at all, but it is in the $1,446.00 the buyers paid.
Report deposits as income and every one of those deductions disappears.
[How to reconcile marketplace payouts to sales](../../ventures/ebay-fee-calculator/how-to-reconcile-marketplace-payouts-to-sales.html).

**2. Cost each item, and split lots by expected resale value.** A $120.00
lot of 20 pieces split equally puts $6.00 on each $5 piece, a loss booked
before you list it. Split by expected price instead, it puts $21.82 on each
of the two $60 pieces and $1.82 on each $5 one, and the 20 allocations still
add to $120.00. At year end those per-item costs make Schedule C Part III a
sum rather than a guess.
[Cost of goods sold for resellers](../../ventures/ebay-fee-calculator/cost-of-goods-sold-for-resellers.html).

**3. Map the year onto Schedule C.** Fees on line 10 (the IRS instructions
say a dealer in property enters fees paid to facilitate a sale there), ads
on line 8, mailers on line 22, labels to buyers in Part V. A worked year
runs from $42,000 of gross receipts to $14,800 of net profit before mileage.
[Schedule C worksheet for resellers](../../ventures/ebay-fee-calculator/schedule-c-worksheet-for-resellers.html).
None of it is tax advice; every line cites the IRS page it comes from.

## Opening and closing inventory, from your sourcing sheet (added 2026-11-25)

Schedule C Part III is where a reseller's cost of goods actually lives, and
it is not a sum of what the sold items cost. It is a balance: inventory at
the start of the year (line 35), plus the year's purchases less anything you
kept for yourself (line 36), less what is still on the shelves at December 31
(line 41), gives cost of goods sold (line 42), which goes to line 4. Line
numbers are from the 2026 form on irs.gov, read on 2026-11-25.

The [Reseller Books tool](../../ventures/reseller-books/) now reads your
sourcing spreadsheet as a CSV (item or SKU, quantity, cost, date bought, and
a date sold or a status such as *personal* or *donated* if you keep them)
next to one tax year of marketplace reports. Each unit a report says you
sold takes the oldest matching purchase still on hand, by the SKU or title
the marketplace shows; a returned unit goes back on the shelf. What the
sheet still holds at December 31 is line 41.

In the page's worked example (a made-up eBay shop, not a real seller), four
film cameras bought in November 2025 at $135 make line 35 $540.00. The year's
purchases are $9,774.00 after a $22.00 jacket kept for personal use. Three
cameras at $142, one LEGO set, four jackets and twenty sleeve lots are left
at year end, so line 41 is $1,186.00 and line 42 is $9,128.00. That equals
the cost of the 167 units the reports sold plus a $40.00 card lot marked
sold at a local show, and a test checks the two always agree.

Three things the page says rather than hides. A sold unit with no purchase in
the sheet is listed by name, because it makes line 42 too low. If you enter
last year's line 41 and the sheet disagrees, the entered figure is used and
the gap is explained, since the form asks for an explanation when line 35
differs from last year's closing inventory. And Etsy sales can only be
matched through Etsy's Sold Order Items file. Part III is also optional for
some sellers: the Schedule C instructions let a small business taxpayer
choose not to keep an inventory. That choice is yours and your preparer's,
and none of this is tax advice.

## Which stock is still on the shelf, and for how long (added 2026-11-25)

Line 41 is one number, but a reseller wants to know what is inside it. The
same inventory log now gives a second table: every unit still on hand at
December 31, aged from the day you bought it, in four buckets (up to 90 days,
91 to 180, 181 to 365, over a year) that add up to line 41 exactly. Below it,
each item is listed with the money that has waited longest first (cost times
average age), its oldest purchase, and how much of what you had during the
year actually sold.

In the page's example (the same made-up eBay shop), all $1,186.00 of closing
stock was bought in January and February, so it is 331 to 360 days old: a
LEGO set at $610.00 has waited 345 days, three cameras at $426.00 have
waited 331. Nothing has passed a year yet. When something has, the page says
how much and names it, and suggests counting it before you sign off line 41.
A test checks the buckets against days counted by hand (February 15 to
December 31 is 319 days; November 30, 2024 to December 31, 2026 is 761).

It is a list to act on (relist, reprice, bundle), valued at cost. Whether
any of it should be valued lower is a question for your preparer, and none
of this is tax advice.

## Has each lot paid for itself? (added 2026-11-26)

The free tool ages what is left at December 31. Seller Books, the hosted
product in development, now has a stock report that works on any day and
goes one step further, to the lot. A bin, pallet or estate-sale haul is
bought as one price and sold as many items, so it is hard to tell whether
it was a good buy. For each lot the report adds up the proceeds of every
sale linked to its items. Proceeds are the item price plus shipping
charged, less refunds, the fees in the marketplace's own report and the
postage on that order, with sales tax left out. It then compares that sum
with what the lot cost and shows the cost still sitting in its unsold items.

The app's test example: an estate-sale lot of three items cost $30.00, and
one item, a vase, sold on Etsy for $34.20 plus $6.50 shipping. That one sale
has earned back $40.70, 136% of the lot's cost, with $20.00 of cost still on
the shelf in the other two items. The same report gives sell-through for a
period (items sold over what you had to sell), median days to sell on each
platform, and the 25 items you have held longest. Proceeds come before
expenses that are not tied to one sale, such as ads bought separately,
subscriptions and supplies, so a lot can show as paid back and still have
lost money once those are counted. The page says so.

## The fee figures, rechecked

Each of the ten tools states its marketplace's current fee in a sourced lead,
and we rechecked all of them today. The marketplaces' own help pages could
not be fetched from our build machine, so we read them through search
extracts of the official pages; the
[agent note](../reports/2026-11-24-seller-tools-front-doors.md) lists each one. All ten still match.
Three sources got better or more honest. Grailed's tiered commission (6% under
$120 with a $1.99 minimum, 9% from $120) is now cited to Grailed's own help
centre rather than to third-party guides. StockX's page now says its help
centre lists a $5.00 minimum seller fee, which the calculator does not apply
for you. Poshmark's page notes the Texas seller fee tax deducted since
October 2025. TikTok Shop's 8% referral fee is still unconfirmed by TikTok's
public table, and the page says that instead of picking a side.

One thing these pages do not say: that a 1099-K is coming for you. The
federal threshold is back at more than $20,000 and more than 200
transactions. Income is reportable either way, and that is reason enough to
keep the books.

## How Seller Books' plans would work (added 2026-11-26)

Seller Books, the hosted version, now has its plans built in, switched off. Nothing is on sale and
no card is taken. The plans are there so that when early access opens, the limits a seller meets are
the ones described here and not a surprise. Prices are still a proposal.

| Plan | Price | Platforms | Users | Orders a month |
|---|---|---|---|---|
| Free | $0 | 1 | 1 | up to 25 |
| Side hustle | $15 a month or $150 a year | 2 | 1 | about 100 |
| Full time | $35 a month or $350 a year | all 6 | 1 | about 600 |
| Business | $69 a month or $690 a year | all 6 | 4 | about 2,500 |

Three rules decide what a plan does, and we chose them with tax season in mind:

- **A busy month never locks a paid plan.** The order numbers are a guide. If December brings 140
  orders on Side hustle, the import still goes through. The billing page shows your busiest month of
  the last twelve and names the plan that fits, and you decide whether to move.
- **The free plan has a real cap, and it refuses a file whole.** If a report would take a month past
  25 orders, nothing from it is imported, and the message names the month. You never get half a
  report and a P&L that quietly misses sales.
- **Nothing you imported is ever hidden.** If a subscription lapses, sales, the P&L, the inventory
  list, the mileage log, the Schedule C worksheet and every CSV export keep working. Only new
  platforms past the free limit and new users wait. Your own books stay yours at filing time.

Platforms are counted by where you import from: once you import one eBay report, eBay is one of
your platforms. Delete every import from a platform and it frees up again.

### A bug that would have failed almost every real file

Writing the tests for these limits turned up an older fault. The app saved sales eight rows at a
time. Each sale row carries 20 values, and the database it runs on (Cloudflare D1) accepts at most 100
values in one statement, so any report with five or more new sales failed outright. The sample files
the importers were tested with had four sales or fewer, so nothing caught it. A real year of eBay
or Mercari exports has hundreds. Rows are now saved in batches sized from each table's column count,
and a test imports a 300-order report. It is the same lesson as
[an earlier post](2026-11-14-the-sample-file-works-the-real-export-crashes.md): test with a file the
size of a real export.

## What Seller Books puts in writing about your data (added 2026-11-26)

Seller Books now has its Terms of Service, Privacy Policy, Refund Policy
and Acceptable Use Policy, and every user accepts the current version
before opening their books. They are drafts until counsel reviews them,
but each privacy statement was checked against what the app actually
stores, and a test fails if the code and the policy drift apart:

- **The report file is not kept.** From an import the app keeps the rows
  your books need (dates, order ids, item titles, SKUs, amounts and each
  fee exactly as the report itemised it) plus the file's name and a
  checksum to catch the same file imported twice. Buyer names and
  addresses are not stored.
- **No AI model reads your books.** Your reports and records go to two
  service providers only: Cloudflare, which hosts the app and its
  database, and Paddle, which handles checkout.
- **Fees come from your reports, never from a published rate.** The
  Schedule C worksheet is a summary for you or your tax preparer, not a
  return and not tax advice.
- **You can delete what you imported.** Deleting an import removes the
  sales it created; an owner can delete the whole shop.

The Refund Policy offers a full refund within 30 days of the first paid
payment, once paid plans open. Seller Books is still in development; the
[online sellers page](https://marisstella.app/industries/online-sellers/)
has early access.

## The sale-by-sale backup behind the worksheet (added 2026-11-26)

A Schedule C line is a single total. If your tax preparer asks where line 1
came from, or how the cost of goods on line 4 was worked out, a total doesn't
answer them. Seller Books now writes a **sales ledger** as a CSV file for any
date range. It has one row for each sale, refund and marketplace charge you
imported. Each row shows the item sales, the shipping the buyer paid, any
refund, the fees (itemised, for example "Final value fee 8.00; Per-order fee
0.40"), postage, the linked item's cost, gross profit, the sales tax the
marketplace collected (which is not your income) and the net the report
itself gave.

The file adds up. Each row uses the same arithmetic as the profit-and-loss
page, so the ledger's gross-profit total equals the P&L's for the same dates.
The app's tests check this on a worked year of Etsy sales: $92.70 of revenue,
less $8.62 of fees, $5.10 of postage and $10.00 of cost of goods, gives $68.98
of gross profit in both places. Store subscriptions get a column of their
own, because they are an expense rather than a cost of each sale. A sale with
no inventory item linked is flagged on its row, and a count at the foot of
the file tells you how many sales still need a cost before the cost of goods
is complete. The file is a bookkeeping record, not a tax return and not tax
advice.

## Quarterly estimated tax when your sales come late in the year (added 2026-11-26)

Nobody withholds tax from reselling profit. So if you expect to owe $1,000 or
more in federal tax for the year after withholding and credits, the IRS
expects you to pay it in four instalments. The due dates are April 15,
June 15, September 15 and January 15, each moved to the next business day
when it falls on a weekend or a Washington, DC holiday. In 2025 the June
payment was due on the 16th.

There are two lawful ways to size those payments, and resellers often fit
the second better:

- **Regular:** a quarter of the year's required payment on each date. The
  required payment is the smaller of 90% of this year's tax and 100% of last
  year's (110% if last year's AGI was over $150,000).
- **Annualized (Form 2210, Schedule AI):** each payment is based on your
  actual profit up to the end of each period (March 31, May 31, August 31,
  December 31), scaled up to a year. For a seller who makes most of their
  profit in the fourth quarter, the April, June and September amounts can be
  close to zero, with the balance due in January.

Here is a worked case that the app's tests check. A single filer in 2026 has
no profit until the autumn and ends the year with $40,000 of Schedule C
profit. That comes to $5,651.82 of self-employment tax and $1,775.11 of
income tax, after the $16,100 standard deduction and a $4,214.82 qualified
business income deduction: $7,426.93 in all. Last year's tax was $6,000.

- Regular method: $1,500 is due on each of the four dates.
- Annualized method: $0 in April, June and September, then $6,000 in January.

To pay on the annualized schedule you file Schedule AI with your return.

Seller Books now has a **Quarterly estimates** page that does this from your
books. It reads the Schedule C profit to each period's end, shows both
methods side by side, and tells you what is still to pay by the next date
after counting the payments you have sent and your withholding. The figures
you type in (wages, last year's tax, payments sent) stay in your browser.
The page is an estimate, not tax advice: it leaves out credits, itemised
deductions and state tax, so check it with your tax preparer.

## What comes next

Each of the ten tool pages now ends with a short "track true profit across
every platform" section. It points to the
[online sellers page](https://marisstella.app/industries/online-sellers/),
where Seller Books, a hosted product that does all three steps from your
payout files, is listed as in development, with early access. Until then, the
free in-browser [Reseller Books tool](../../ventures/reseller-books/)
already groups eBay, Etsy, Poshmark, Whatnot and Shopify exports into
Schedule C lines.
