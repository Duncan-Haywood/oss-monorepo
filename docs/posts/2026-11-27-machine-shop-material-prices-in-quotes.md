---
title: "Keeping material prices current in machine-shop quotes"
seo_title: "Machine shop quoting: keep material prices current"
date: 2026-11-27
tags: [jobshop-quote, for-customers, cnc, quoting, materials, ventures]
description: "Rate cards typed in once quote old metal prices. Date each price, import supplier sheets, keep cwt and metre exact, edit bar setups, see quotes touched."
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

## Importing the supplier's price sheet

Most suppliers send prices as a spreadsheet or a PDF table. If the shop has that sheet in Excel or
Google Sheets, an admin opens **Import from a spreadsheet** on the rate card, chooses
**Materials**, and picks the file or pastes the rows. Each row is matched to the card by material
name. Two optional boxes take the supplier's name and the date on the sheet.

Before anything is saved, each row that changes a price shows the change and the open quotes priced
at the old price. With made-up names and prices:

> Aluminum 6061-T6 plate: Price: $4.86/lb, up 8.0% from $4.50/lb. Open quotes priced at the old
> price: Q-1042 (Acme Brackets, draft), Q-1037 (Northline Tool, sent).

A line under the table counts the open quotes the import touches, so the admin sees the effect of
a whole price list before committing to it, not after. Nothing is re-priced on save. Drafts are
re-priced on their own page, and sent quotes keep the price the customer saw.

After saving, the supplier and the sheet's date stay with each new price in its history:

> 2026-11-27 $4.86/lb, up 8.0% from $4.50/lb (imported by Pat, from Acme Metals's price list
> dated 2026-11-20)

Six months later, that line answers "where did this price come from?" without anyone digging
through email.

## Prices per hundredweight or per metre

Steel service centers often quote plate and structural shapes per hundredweight (cwt, 100 lb), and
metric suppliers quote bar and tube per metre. Converting those to a price per pound or per foot
rarely comes out to a whole cent: $412.50/cwt is $4.125/lb, and $10.00/m is $3.048/ft. Rounding
to $4.13/lb looks harmless, but on 3,000 lb of plate it adds $15 that the supplier never charged.

So a material can now keep its price in the supplier's unit. In the Materials form, **Price per**
offers lb or cwt for material bought by weight, and foot or metre for material bought by length.
The import reads "Price per cwt" and "Price per metre" columns directly. The quote prices from
the exact figure and rounds only the line's material total, and the basis line shows both numbers
(made-up figures):

> Material: A36 plate, 10 lb per part at $412.50/cwt ($4.125/lb)

History, **New price** and the list of open quotes a price touches all read in the card's unit,
for example "$440.00/cwt, up 6.7% from $412.50/cwt". If a shop re-enters a $4.25/lb price as
$425.00/cwt, the price is re-dated, but no open quote is flagged for Re-price, because nothing a
quote charges has changed.

## Changing how bar stock is cut and bought

Bar, tube and extrusion priced by the foot carry more than a price: a cut allowance (saw kerf and
facing added to each blank), the bar length the shop buys, and the remnant each bar leaves in the
chuck or bar feeder. These change too. The shop switches from 12 ft to 20 ft bars, or puts a wider
blade on the saw. Until now that meant retiring the material and adding it again, which lost its
price history.

Each per-foot material now has **Bar setup** next to New price. It edits the stock size, cut
allowance, bar length and remnant (or the scrap % when the shop charges by the length used), and
leaves the price and its date as they are. Before saving, **Check a blank** shows what one part
gets per bar now and with the new settings (made-up figures):

> A 2.875 in blank: 3 in per part, 47 parts per bar now; 3.0625 in per part, 46 parts per bar
> with these settings.

A sixteenth of an inch of extra kerf costs one part per bar here, and the check makes that visible
before the change goes onto the card. It uses the same arithmetic as the quote. If a blank no
longer fits the usable bar, the check says the price would be blocked.

Draft lines priced with the old setup say so, the same way they do for a price change: "This line
was priced with 1018 CRS 1 in round at 0.125 in cut allowance, 144 in bars (3 in remnant); the
rate card now has 0.1875 in cut allowance, 144 in bars (3 in remnant). Re-price to use it." Sent
quotes keep what they went out at.

## What comes next

Possible next steps, if shops ask for them: reading the supplier and date from the sheet's own
header instead of typing them, matching rows by grade and size when the supplier's names differ
from the card's, and a list of stale prices in the weekly email. Job Shop Quote is in early access;
the [Job Shop Quote page](https://marisstella.app/industries/manufacturing/) has the details.
