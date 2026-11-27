---
title: "Keeping material prices current in machine-shop quotes"
seo_title: "Machine shop quoting: keep material prices current"
date: 2026-11-27
tags: [jobshop-quote, for-customers, cnc, quoting, materials, ventures]
description: "A rate card typed in once quotes old metal prices. How a job shop can date each material price, keep its history, and find open quotes priced from an old one."
---

*Written by an AI agent working in this repository.*

A CNC or fabrication shop's quote is usually built from three parts: machine time at the shop's
hourly rates, outside services, and material. Machine rates change maybe once a year. Material
prices change whenever the shop's supplier changes them, and the shop finds out when it buys bar or
plate for a job. If the price on the rate card is from the spring, a quote sent in the autumn can
carry a material cost that no longer matches what the shop will pay. On a job where material is a
large share of the price, that difference comes straight off the margin.

The fix is mostly bookkeeping: know when each material price was last checked, keep the old prices,
and get a warning before an old price goes out on a quote. Job Shop Quote now does all three.

## When each price was set

Every material on the rate card shows when its price was last set: "today", "12 days ago",
"143 days ago". The date moves only when the price itself changes ($/lb for material bought by
weight, or the price per stock piece). Renaming a row, or fixing its density, scrap or sheet size,
does not move it, because none of those is a new price from the supplier.

The shop sets a limit in its settings, "Material price limit (days)". It is 90 days by default,
and leaving it blank turns the warning off. A material past the limit shows its age in amber, and
the Materials card says how many prices are past it.

## A new price in one step

When the supplier sends a new quote for 6061 plate, the admin presses **New price** on that row,
types the new $/lb and saves. A shop that keeps its prices in a spreadsheet can import the sheet
instead, as before. Both write the same history.

## The price history

**History** on a row lists every price the material has had, newest first, with the change from
the one before and who set it. An example, with made-up names and prices:

> 2026-12-04 $4.25/lb, up 6.3% from $4.00/lb (edited by Pat)
> 2026-09-15 $4.00/lb (on the card when price history began)

For a shop that already had materials on its card, the history starts with the price on the card
on the day the feature arrived, labelled "on the card when price history began". It is dated by
the row's last edit, the nearest date the app has. No earlier price is made up.

## What a draft quote says

A quote line prices from the rate card at the moment it is priced, and keeps that snapshot until
the estimator presses Re-price, so a quote does not change while someone is working on it. A draft
line can now say two things about its material (the examples use made-up prices):

- **The price is past the limit.** "The 6061-T6 bar price on the rate card was last set 166 days
  ago (2026-06-14), past the shop's 90-day limit. Check it with your supplier, update the rate
  card, then Re-price."
- **The card changed after the line was priced.** "This line was priced with 6061-T6 bar at
  $4.00/lb; the rate card now has $4.25/lb. Re-price to use it."

Neither note changes a number. The app does not look up or guess market prices: the only prices it
uses are the ones the shop typed or imported. Sent quotes keep the price they went out at.

## Which open quotes a new price touches

A note on each draft line helps the estimator who opens that quote. It does not help the admin who
has just typed in the supplier's new price and wants to know which open quotes it affects. The
Materials card now answers that. After a price changes, it lists every open quote with a line
priced at a price the card no longer has. Open means a draft, or a sent quote the customer has not
yet accepted or turned down. For each quote it shows the customer, whether it is a draft or sent,
the price it was priced at, and the move. With made-up names and prices:

> Aluminum 6061-T6 plate: the card now has $4.86/lb
> - Q-1042 Acme Brackets (draft), priced at $4.50/lb, up 8.0%. Re-price it on the quote.
> - Q-1037 Northline Tool (sent), priced at $4.50/lb, up 8.0%. Sent at the old price; revise it
>   if the change matters.

A "Moved by at least" filter (any change, 1, 2, 5 or 10%) hides small moves, so a two-cent change
on a cheap material does not bury a large change on an expensive one. If a material's basis
changed (from per pound to per stock piece, say), the old and new prices can't be compared as a
percentage, so those quotes are always listed. Each quote links to its page, where Re-price
updates a draft from today's card. Won, lost, expired and replaced quotes are left out: their
price is settled.

The list only reads. It does not re-price anything, and a sent quote keeps the price the customer
saw. Whether to send a revised quote on an 8% move is the shop's call, not the software's.

## What comes next

The next part reads a supplier's own price sheet as a price list (grade, size, $/lb or per
piece), matches each line to the card, and shows every change, and the open quotes each change
touches, before saving. Job Shop Quote is in early access; the
[Job Shop Quote page](https://marisstella.app/industries/manufacturing/) has the details.
