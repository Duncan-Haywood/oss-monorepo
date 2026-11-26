---
title: "Subcontractor estimating: price the bid from your costs, then bill from the same numbers"
seo_title: "Subcontractor estimate to proposal to schedule of values"
date: 2026-11-26
tags: [for-customers, payapps, construction, estimating, bid-alternates, price-list, bid-follow-up, schedule-of-values, job-costing, budget-by-cost-type, pay-app-guides]
description: "Price a bid from your costs and a reusable price list, add alternates, send the GC prices only, follow up, and start the won job's schedule of values and its labor and material budgets."
---

*Written by an AI agent working in this repository. The example below is invented, and the
arithmetic is the same arithmetic our tests check. Your markups, tax and retainage come from
your own costs and your subcontract, not from this page.*

Most specialty subcontractors price a bid in a spreadsheet and send the GC a proposal from it.
If they win, they type the numbers in again: once into the schedule of values the GC wants on
the first pay application, and maybe once more into whatever tracks cost against budget. Every
retype can go wrong. A schedule of values that does not match the bid makes the first billing
an argument. A budget that does not match the bid turns the WIP schedule into guesswork.

The pay-app billing we are building now starts one step earlier, at the estimate.

## How the estimate is put together

An estimate is a list of **cost lines**. Each line has a quantity, a unit and a unit cost, and
belongs to one of five categories: labor, material, equipment, subcontract or other. Each line
also names its **bid item**, the line the GC will see. Lines with the same bid item add up to
one item on the proposal.

**Markup is set per category**, because most shops mark up labor differently from material,
and a lower-tier sub differently again. If you pay **sales tax on material**, the tax goes on
material cost first, and the markup applies to material plus tax. Markup can go over 100%, up to 500%, for
the small service line that carries a trip charge.

The rounding is done once per bid item and category. The proposal total is then always exactly
the sum of its items, and each item is exactly cost + tax + markup. That is the check a GC's
estimator runs first.

## A worked example

A sheet metal sub bids a clinic's ductwork and equipment setting, with 15% markup on labor,
10% on material, 5% on the crane sub and 7.5% tax on material:

| Bid item | Line | Qty | Unit cost | Cost |
|---|---|---|---|---|
| Ductwork | Labor, sheet metal crew | 120 HR | $68.50 | $8,220.00 |
| Ductwork | Material, galvanized duct | 1,450 LB | $4.875 | $7,068.75 |
| Equipment setting | Subcontract, crane and rigging | 1 LS | $3,200.00 | $3,200.00 |

- **Ductwork:** cost $15,288.75. Tax is 7.5% of $7,068.75, which is $530.16. Markup is
  $1,233.00 on labor plus 10% of ($7,068.75 + $530.16), which is $759.89. **Price: $17,811.80.**
- **Equipment setting:** $3,200.00 plus 5%. **Price: $3,360.00.**
- **Bid: $21,171.80.** Markup is about 10.2% of the price.

## Prices go to the GC; costs stay with you

The proposal PDF lists each bid item and its price, the total, what is included and excluded,
the date the offer lapses (30 days by default) and a place for the GC to sign. It does not show
the cost lines, the tax or the markup. Those stay on your estimate page.

## When you win, the job starts from the bid

"Won: start the job" creates the job with the GC, contact, location and contract sum from the
estimate. Each bid item becomes one **schedule-of-values line** at its price: in the example,
line 1 is Ductwork at $17,811.80 and line 2 is Equipment setting at $3,360.00. With job
costing, each line's **cost budget** is the item's cost with tax ($15,818.91 and $3,200.00).
From then on, costs posted to the job are measured against what you bid, and the first pay
application bills against the numbers the GC already accepted.

### The budget keeps the bid's labor and material apart

A line's budget is not one number. Each line's budget is **split by cost type** the way you bid
it: labor, material (with its sales tax), equipment, subcontract and other. In the example:

| Line | Labor | Material with tax | Subcontract | Budget |
|---|---|---|---|---|
| 1 Ductwork | $8,220.00 | $7,068.75 + $530.16 = $7,598.91 | | $15,818.91 |
| 2 Equipment setting | | | $3,200.00 | $3,200.00 |

Costs are entered with a cost type already (a week's payroll is labor, a supplier invoice is
material), so the job-cost page sets each type against its own budget. Say that by the second pay
application, ductwork has $9,100.00 of payroll and $6,400.00 of duct posted to it:

- **The line as a whole:** $15,500.00 against $15,818.91. That is $318.91 under budget, and it
  looks fine.
- **Labor:** $9,100.00 against $8,220.00. That is **$880.00 over**, at 110.7% of its budget. The
  row turns red, and the page lists it as an issue.
- **Material:** $6,400.00 against $7,598.91, with $1,198.91 left.

The line total hides the labor overrun because material came in under. The question for the
foreman is how many hours are left, and the split shows that while the hours can still be
recovered. A cost in a type the line was bid with none of, such as a lift rental on the ductwork
line, shows as over a $0 budget instead of disappearing into the total.

You can split any line by hand, including on jobs that did not start from an estimate. Saving a
split sets the line's budget to its total. If you change the line's budget alone later, the page
shows the difference as "not split" and does not spread it over the types by a guess. The line's
budget, not the split, still drives the estimate at completion and the WIP schedule. The job-cost
CSV lists the split lines type by type for your accountant.

After a win, the estimate's lines are locked as the record of what was bid. Changes to the
contract go through change orders, as they do on site.

## Bringing in the spreadsheet you already have

You do not have to type the bid in again. "Import from a spreadsheet" on an estimate reads an
.xlsx or CSV file, or rows you copy in Excel or Google Sheets and paste, header row included.
That can be your own bid sheet, a supplier's quote, or a takeoff material list. The file is read
in your browser and is never uploaded. You see a preview, untick what you do not want, and the
lines you keep go into the estimate like lines you typed.

Columns are found by their headers: a description, a quantity, a unit, and a unit cost or a
total. A bid item column and a category column are read too, if the sheet has them. Some
sheets have no bid item column and put a heading row, such as "Rough plumbing", above each group.
Each heading then names the bid item for the lines under it. A bid sheet with a unit cost per
category (material unit, labor unit, equipment, sub) gives one cost line for each category that
has a price.

The import does not guess. Here is a supplier's quote pasted in:

| Description | Qty | Unit | Net price | Amount |
|---|---|---|---|---|
| 1/2" PEX tubing, 300 ft | 4 | RL | 89.95 | 359.80 |
| Elongated toilet | 6 | EA | | 1,137.00 |
| Lavatory faucet | 6 | EA | | |

The tubing comes in as 4 RL at $89.95. The toilet has a total and no unit price, so its unit cost
is worked out as $1,137.00 ÷ 6 = $189.50 and marked for you to check. The faucet has no price at
all. It comes in at $0 a unit and is marked to be priced, and the preview says how many lines
still need a price. A row whose quantity × unit cost does not match its printed total keeps the
quantity and unit cost and shows both figures. Subtotal and total rows are left out, because the
estimate adds its own. Rows that do not read, such as "ten" in the quantity column, are listed
with the row number and the reason.

## Add and deduct alternates

Bid forms often ask for alternates: "Alternate No. 1: provide a controls package, add $___" or
"Alternate No. 2: omit the equipment setting, deduct $___". In the estimate, any bid item can be
marked one of two ways:

- An **add alternate** is priced on the proposal but left out of the base bid. If the GC accepts
  it, it is added.
- A **deduct alternate** stays in the base bid. If the GC accepts the deduction, it comes out.

A substitution, such as PVC in place of copper, is a deduct of the base item plus an add of its
replacement.

Back to the example. Say the GC also wants a price for a $1,500.00 controls package (no
markup), and the option to take the equipment setting out:

| Item | Bid item | In the bid | Price |
|---|---|---|---|
| 1 | Ductwork | Base bid | $17,811.80 |
| 2 | Equipment setting | Deduct alternate No. 1 | $3,360.00 |
| Alt 2 | Controls | Add alternate No. 2 | $1,500.00 |

The **base bid stays $21,171.80**: Ductwork plus Equipment setting, without Controls. The
proposal prints it as "Base bid", then an Alternates section with a box beside each one for the
GC to tick: "Add $1,500.00" and "Deduct $3,360.00".

When you mark it won, you tick the alternates the GC accepted. The job's schedule of values is
built from exactly those items and renumbered. If the GC takes both alternates, line 1 is
Ductwork at $17,811.80, line 2 is Controls at $1,500.00, and the **contract sum is $19,311.80**,
which is $21,171.80 + $1,500.00 − $3,360.00. The estimate keeps the record of which alternates
were accepted.

## A price list you keep once and reuse on every bid

Most estimators price the same few hundred things on every bid: the crew rates, the duct by the
pound, the lift by the day, the crane sub's lump sum. Retyping them is slow, and copying last
month's estimate brings last month's prices with it. So the company keeps a **price list**: each
item is a category, a description, a unit and a unit cost, with a code (a part number) and a note
on where the price came from ("supplier quote 11/20") if you want them. Labor rates are labor
items by the hour.

The list fills three ways: typed on the price list page, read from a supplier's price sheet with
the same spreadsheet import as above (in your browser, never uploaded), or from an estimate with
**Save lines to the price list**. On an estimate, **Add from the price list** searches by any word
in the description, code or note, and adds the line under the current bid item with the quantity
left for you to type.

An item and a line are the same price when the category, the description and the unit match,
ignoring capitals and extra spaces: "galvanized  DUCT" by the "lb" is "Galvanized duct" by the
"LB". Saving lines updates the price of items already on the list and adds the rest. If the same
item appears twice at different costs, the last one is kept and the page names it so you can
check.

A line **copies** the cost. Changing the list never changes an estimate you already saved. That
matters for a bid that is out with the GC: its proposal has to match what you sent. For a bid
still being priced, the estimate shows **Use list prices** when some lines differ from the list,
and sets them to it for you to check and save.

Back to the example. The supplier's new quote puts galvanized duct at $5.125 a pound instead of
$4.875. You change it once on the price list. On the clinic estimate, "Use list prices (1 differ)"
sets that line to $5.125:

- **Ductwork:** material is now 1,450 × $5.125 = $7,431.25, so cost is $15,651.25. Tax is 7.5% of
  $7,431.25, which is $557.34. Markup is $1,233.00 on labor plus 10% of ($7,431.25 + $557.34),
  which is $798.86. **Price: $18,240.45.**
- **Bid: $21,600.45**, up $428.65. Equipment setting is unchanged at $3,360.00.

The next estimate that picks galvanized duct from the list starts at $5.125.

## Sending the bid, and following up on it

On an open estimate,
**Email the proposal** drafts the email that goes with the PDF, and once the estimate is marked
sent, **Follow up by email** drafts the chase. Both are written from the saved estimate only. With
the clinic bid above (Equipment setting as deduct alternate No. 1, Controls as add alternate No. 2)
and the GC estimator entered on the estimate, the bid-day draft reads:

> Hello Dana Ruiz,
>
> We are pleased to submit our proposal EST-0007 for Riverside Clinic, mechanical (Riverside),
> for the bid due 2026-12-03.
>
> Base bid: $21,600.45.<br>
> Alternates:<br>
> \- Alternate No. 1 (deduct): Equipment setting, deduct $3,360.00<br>
> \- Alternate No. 2 (add): Controls, add $1,500.00
>
> The proposal lists what is included and excluded, and is open for acceptance until 2026-12-31.

The open date is the one the PDF prints: 30 days from the day it is sent. The draft does not say
a file is attached, because you attach the PDF yourself, and nothing is sent from the app: you edit
it, then copy it or open it in your own email. After you use it, the page offers **Mark sent
today**, so the PDF keeps that date and the next draft is the follow-up.

A week later, the follow-up says when the proposal went out ("sent on 2026-12-01 (7 days ago)"),
repeats the base bid and alternates, and asks where the bid stands, whether anything is needed
from you, and, if the work went to someone else, for the result and any feedback on the number.
Past the open date it says the offer was open until then and offers to confirm the pricing or send
an updated proposal, rather than holding you to a number that has lapsed. Won and lost estimates
get no draft.

## What it does not do yet

It does not track price history: the list holds today's price and the date it was last changed.
It does not read a PDF quote: export it as a spreadsheet first. An alternate here is a whole bid item: a
deduct that is only part of an item has to be set up as its own bid item. It does not check your
quantities or tell you what markup the market will bear. It does not send anything to the GC:
it drafts the email, and you attach the PDF and send it yourself. It does not yet remember when you
last followed up on a bid. The budget split goes down to the five cost types, not to your own cost
codes, and a sub quote on the estimate does not yet become a subcontract commitment on the job,
because the estimate does not keep the sub's name.

We are building hosted pay-app billing for specialty subcontractors. It covers estimates,
schedules of values, change orders, pay applications, retainage, lien waivers, RFIs,
submittals and job costing. It is in development, with early access, and nothing is for sale
yet: [construction tools and early access](https://marisstella.app/industries/construction/).
