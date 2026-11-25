---
title: "Quality fix: dropping an add-on is not a churned customer"
seo_title: "Logo churn per customer, not per subscription, from Stripe"
date: 2026-11-25
tags: [quality-audit, mrr-pulse, saas-metrics, stripe]
description: "MRR Pulse now counts logo churn, NRR and MRR movements per Stripe customer: a dropped add-on is contraction and a plan swap is expansion, not churn."
---

Logo churn is the share of *customers* who stopped paying. Stripe stores
*subscriptions*, and a customer can hold several: a base plan and a seat
add-on, or an old plan cancelled the minute a new one starts. Count the
subscriptions and two ordinary events read as lost customers.

The [quality audit of 2026-11-21](../../portfolio/quality/audits/2026-11-21-mrr-pulse.json)
showed both in [MRR Pulse](../../ventures/mrr-pulse/), the read-only Stripe
MRR dashboard:

| what the customer did | before (per subscription) | now (per customer) |
|---|---|---|
| keeps a 5,000 base plan, drops a 1,000 add-on (3 subs, 2 customers) | logo churn 33%, 1,000 churned MRR | logo churn 0%, 1,000 contraction |
| swaps a 5,000 plan for an 8,000 plan by cancel-and-create | logo churn 100%, NRR 0, 8,000 new | logo churn 0%, NRR 160%, 3,000 expansion |

Both "now" columns follow the usual definitions: a logo is a paying
customer, and net revenue retention is the revenue kept and grown from the
customers you started the month with. The two rows
are tests in `ventures/mrr-pulse/metrics.test.mjs`, and a seeded bug that
keys the maps by subscription again turns them red.

## What changed

- The MRR maps behind the history, the movements and the rates are keyed by
  the Stripe customer id (`metrics.mjs`, `customerKey`). The Customers tile,
  logo churn, NRR, GRR and quick ratio follow.
- The CSV demo reads a `Customer ID` column when the export has one. Without
  it, each subscription stands for its own customer, which is what the tool
  did before, and the page now says so.
- Customer concentration is per customer too (`customers` in
  `/v1/concentration`, renamed from `subscriptions`).
- A server that saved its state with an older version re-keys it on the next
  sync, so upgrading does not book every subscription as churned and every
  customer as new. A test covers it.

## Still not at the bar

The retention-by-signup-month table still counts subscriptions, and NRR is a
one-month figure with no trailing-12-month view; both are listed in the
README's "Known gaps". The audit's other open items (an `unpaid` subscription
vanishing from past months, movements summed per sync rather than netted per
month) are unchanged. A later re-audit scores the fix; this post does not.

Not financial or accounting advice: reconcile the numbers against your books
before showing them to investors.
