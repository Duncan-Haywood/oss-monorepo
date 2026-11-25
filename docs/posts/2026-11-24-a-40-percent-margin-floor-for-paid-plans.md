---
title: "A 40% margin floor for our subscriptions, and what it did to Grant Autopilot's prices"
seo_title: "A 40% margin floor for AI subscription plans"
date: 2026-11-24
tags: [portfolio, monetization, pricing, saas, llm-cost]
description: "Every subscription tier must now keep at least a 40% margin at full use, checked by a unit test. Grant Autopilot moves to $10/$29/$149, then to Haiku."
---

Our paid products now have a margin rule. Every paid plan has to keep **at
least a 40% margin** even when a customer uses the whole plan, and 40 to 60%
is the minimum we aim for, not a cap. Higher is better. The owner set it the day the portfolio's goal became $10k of
monthly recurring revenue, with $10k of monthly recurring *profit* as the
stretch: "we want to aim for min 40-60% margins in the products."

Margin here means one minus the full cost of serving the plan, divided by
its price. Full cost is model tokens, hosting, the merchant-of-record fee
(5% + $0.50 a charge) and a 3% refund reserve. We measure it at **full
allowance**, the worst case. Most customers use less, so the margin we
actually make will be higher. How much higher stays unmeasured until there
are paying customers.

## The rule is a test, not a promise

A margin target that lives in a doc gets forgotten the next time a prompt
grows by 2,000 tokens. So the rule is code. Our shared billing package works
out each plan's full cost from per-stage token estimates and fails CI if any
paid plan, billed monthly or annually, drops below 40%. Plan allowances are
derived at a 50% margin, which leaves room for model prices or prompt sizes
to drift before the floor breaks. There is no ceiling. The old rule had one:
a 1.3× to 2.0× band of price over cost, which capped margin at 50%. The
market decides whether a price is too high. A test shouldn't.

## What it did to Grant Autopilot

Grant Autopilot drafts grant applications from an organisation's own
documents and checks every claim against them. It was priced cost-plus: a
nonprofit tool, 1.3× to 2.0× of cost. Opus-drafted, independently verified
applications cost about **$1.30 each** to produce, and output tokens are
most of that. At the old prices, a 50% margin leaves almost nothing:

| Plan | Old price | Drafts a month at a 50% margin | New price | Drafts a month | Margin monthly / annual |
| --- | --- | --- | --- | --- | --- |
| Starter | $5 | 0 | $10 | 1 | 62% / 63% |
| Standard | $20 | 2 | $29 | 5 | 54% / 51% |
| Pro | $100 | 17 | $149 | 31 | 54% / 51% |

We chose prices that keep each tier at about the drafts it had before
(Standard still 5, Pro 31 instead of 33) instead of cutting allowances to fit
the old prices. The owner's view on the result: "reasonable for the value
prop." For scale, Instrumentl, a grant-search platform, is reported at $299
to $999 a month. Checkout is still dark, so nobody is being moved
from one price to another.

The machine-shop quoting proposal follows the same rule. It keeps its $199
and $399 prices, which match the market. Its monthly RFQ allowances fall
from 200 and 400 to 125 and 300, for margins of 51 to 58% at full use.

## What would move the numbers

- **The model.** Drafting is the cost. Sonnet 5.5 lists at half Opus 5.5's
  token price, so using it for first drafts, with Opus kept for
  verification, would cut that part of the cost by about half. That is a
  quality question to answer with evaluations first.
- **Real usage.** Allowances assume every customer uses everything. Metered
  cost per application is already recorded, so the first months of real use
  will show how much headroom there is.
- **The $0.50 fee.** On a $10 plan the fixed merchant fee is 5% of the
  charge. Annual billing pays it once a year instead of twelve times.

## Update, the same evening: Haiku, not Opus

The owner's next instruction made the model the first lever, not the last:
"use the cheapest model that does the job correctly ... no need to use opus
for a haiku task." Grant Autopilot now runs on Claude Haiku 5.5, which lists
at $0.10 and $0.50 per million input and output tokens against Opus 5.5's $4
and $20. A drafted, checked application falls from about $1.30 to about
$0.03.

The prices stay at $10, $29 and $149. The plans now include 5, 20 and 120
drafts a month, and each tier still costs less per draft than the one below
it. At full use that is a margin of 82% to 88%, and the merchant's fixed fee
becomes the biggest cost on the $10 plan. A purpose moves back up to Sonnet
or Opus only if the evaluations show Haiku getting it wrong. Haiku's draft
quality hasn't been measured on live calls yet. Whatever model writes a
draft, the grounding checks still stop any claim the organisation's own
documents don't support.

These are list-price estimates from our own cost model, not measured bills.
The figures come from the pricing tables and the tests that check them, so a
later change to either will show up in CI.
