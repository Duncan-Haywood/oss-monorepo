---
title: "\"Partially refunded\" is not \"refunded\": red-teaming the delivery commission analyzer"
seo_title: "Delivery order statuses: a partial refund is still a sale"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, python, redteam, restaurants, honest-marketing]
description: "20 faults seeded, 18 caught. A status match erased the food sales of partly refunded orders, and our fake-review checker missed two claims."
---

Today's red-team run seeded ten faults each into two files: the calculation
module of the [restaurant delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/),
which reads a DoorDash, Uber Eats or Grubhub payout export and works out what
the platforms really kept, and `platform/ci/check_social_proof.py`, the CI
check that stops our pages claiming reviews or user counts we cannot back.

## The real bug

The analyzer decides an order was cancelled from its status column. The test
was one regular expression, `cancel|declin|reject|expire|void|fail|refund(ed)?\b`,
matched anywhere in the status. So "Refunded" cancelled the order, as it
should, but so did "Partially refunded" and "Refund requested".

A cancelled order sold no food, so the analyzer sets its food sales to zero
and keeps its charges as pure cost. For a partly refunded order that is
exactly wrong: the food went out, the customer got a few dollars back, and
the refunded part already sits in the error/refund column. With four $40
orders, one each marked Delivered, Partially refunded, Refund requested and
Delivered again with its own $8 error charge, the report showed $40 of food
sales and **-$8** of net cash. The right figures are $120 and $62.

Now a refund cancels an order only when it is the whole status: "Refund",
"Refunded" or "Fully refunded". The test that reproduced it came first and
stays in the suite.

## The checker that let two claims through

`check_social_proof.py` flags "trusted by", "join 5,000 users", star ratings
and "as seen in" unless the line attributes the claim to someone else. It
passed both of these:

- "Used by 10,000+ restaurants" (and "relied on by", "chosen by")
- "4.9/5 from 1,200 reviews"

They are the same claims as "trusted by" and "rated 4.9/5" in other words.
The check now catches a count of an audience after "used by" and a rating
with a review tally. Our comparison pages quote a competitor ("Public research
reports it is used by more than 200,000 service professionals"), so "reports
it" now counts as attribution, and the 6,748 venture pages still scan clean.

## The numbers

| Target | Seeded | Caught | After the new tests |
|---|---|---|---|
| analyzer `calc.mjs` | 10 | 8 | 10 |
| `check_social_proof.py` | 10 | 10 | 10 |

The two faults the analyzer's tests missed were a number-format vote that
only a three-decimal grouped amount (`1,234.500`) decides, and the date
window of the built-in example, which nothing pinned. Each has a test now.
The analyzer is free and MIT licensed; its results are estimates from your
own file, not accounting or tax advice.
