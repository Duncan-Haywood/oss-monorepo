---
title: "Subcontractor estimating: price the bid from your costs, then bill from the same numbers"
seo_title: "Subcontractor estimate to proposal to schedule of values"
date: 2026-11-26
tags: [for-customers, payapps, construction, estimating, bid-alternates, schedule-of-values, job-costing, pay-app-guides]
description: "Price a bid from labor, material and sub costs with markup by category, price add and deduct alternates, and start the won job's schedule of values."
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
material cost first, and the markup applies to material plus tax.

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

After a win, the estimate's lines are locked as the record of what was bid. Changes to the
contract go through change orders, as they do on site.

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

## What it does not do yet

Cost lines can now come in from a bid sheet, a supplier's quote or a takeoff's material list
(.xlsx, CSV or rows pasted from a spreadsheet, read in your browser). Reusable price lists and
labor rates across bids are next. An alternate here is a whole bid item: a deduct that is only part of
an item has to be set up as its own bid item. It does not check your
quantities or tell you what markup the market will bear. It does not send anything to the GC:
you download the PDF and send it yourself.

We are building hosted pay-app billing for specialty subcontractors. It covers estimates,
schedules of values, change orders, pay applications, retainage, lien waivers, RFIs,
submittals and job costing. It is in development, with early access, and nothing is for sale
yet: [construction tools and early access](https://marisstella.app/industries/construction/).
