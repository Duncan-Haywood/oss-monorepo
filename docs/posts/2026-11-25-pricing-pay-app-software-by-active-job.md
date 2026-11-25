---
title: "Pricing pay-application software by active job, and what a lapsed subscriber keeps"
seo_title: "Pricing pay-app software by active job"
date: 2026-11-25
tags: [construction, pricing, saas, retainage, paddle]
description: "How PayApps meters plans by active job, why a lapsed subscriber keeps reading and exporting every pay app, and the margin test behind the four prices."
---

PayApps is the pay-application product we are building for specialty
subcontractors. It covers the schedule of values, change orders, retainage
and the monthly application-for-payment summary with its continuation sheet.
This week it got plans and a checkout. Paid plans are not on sale yet:
checkout stays switched off until the payment provider's account is set up.
But the rules are written and tested, and some of the choices are worth
explaining.

## The unit is the active job

A subcontractor thinks in jobs. An electrical sub might have twelve jobs open
in a month and bill each one on its own schedule of values. So the plans
count **active jobs**, meaning projects not yet marked closed:

| Plan    | Monthly | Active jobs | Users     |
| ------- | ------- | ----------- | --------- |
| Free    | $0      | 1           | 1         |
| Solo    | $99     | 5           | 2         |
| Crew    | $179    | 20          | 3         |
| Company | $249    | unlimited   | unlimited |

Paying yearly takes 10% off. When a job is finished and its final retainage
is released, closing it frees the slot. Seats would be the wrong unit: the
person billing is often the owner or one bookkeeper, so a per-seat price
charges small subs for nothing they use. A per-pay-app price would be worse:
it makes the customer think about cost each month, right when they are
trying to get paid.

The prices are hypotheses, set against what subs already pay. PayAppHub
lists $39.99 to $129.99 a month, Trimble Pay's subcontractor plan $99, SubLien
starts at $199 and JobTread at $199 plus $20 a user. None of these prices
has been tested on a customer yet.

## What happens when a subscription lapses

This is the rule we spent the most time on. Pay apps are billing records. A
sub may need last March's continuation sheet for a dispute two years from
now. So when a card fails or a plan is cancelled:

- for 7 days after the first failed renewal, nothing changes, and the
  Billing page shows the deadline;
- after that, Free limits apply. The sub **cannot start a new pay
  application** while it has more active jobs than Free allows, and cannot
  add jobs or users;
- every job stays readable, every draft stays editable, and every PDF and
  CSV export keeps working. Nothing is hidden or deleted.

The paywall sits on new work, never on the customer's own records.

## The margin test

PayApps makes no AI model calls. What it costs to run is hosting, storage for
pay-app PDFs and backup, and the payment provider's fee (5% plus $0.50 a
charge), plus a 3% reserve for refunds. A unit test works out the full cost
of each paid plan at its whole allowance and fails the build if any plan's
margin drops below 40%. For the unlimited plan it assumes 200 active jobs.
Every plan is above 90% today. That leaves room to add lien-waiver
e-signature, which does cost per envelope, without repricing.

## Checkout without holding a card

Checkout is hosted by Paddle, the merchant of record, which handles card
details, sales tax and invoices. The app stores only a subscription row per
company. A webhook from Paddle can move a company to a plan only in two ways:
through a subscription id the company already holds, or through a signed,
single-use, expiring token the app created when an admin clicked
"Choose Crew". Tests cover the attacks. A crafted company id in the
checkout's custom data is ignored. A replayed token is refused. A second
payer cannot take over a company's subscription. And no webhook can grant the
complimentary plan.

## Next

Next come lien-waiver tracking per pay app, gated to Crew and up, a
QuickBooks Online export with retainage as its own line, and a free
G702/G703-style template page in this repository that leads to the app.
