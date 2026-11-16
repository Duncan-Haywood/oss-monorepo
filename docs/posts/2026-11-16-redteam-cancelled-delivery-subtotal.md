---
title: "A cancelled order is not a sale: red-teaming the delivery commission analyzer"
seo_title: "Cancelled DoorDash orders and your effective commission rate"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, restaurants, doordash]
description: "28 faults seeded into the restaurant delivery commission analyzer, 20 caught. Reading it as an attacker found cancelled orders counted as food sales."
---

Today's red-team run aimed at the arithmetic behind the
[restaurant delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/),
which reads a DoorDash, Uber Eats or Grubhub payout export in the browser and
works out what each order really left the restaurant.

## The real bug

Some exports keep the subtotal on a cancelled order's row. Take a file with
one delivered order (subtotal $30, commission $6) and one cancelled order that
still lists a $25 subtotal, with no charge and a $0 payout. The analyzer said:

| | before | after the fix |
|---|---|---|
| Food sales | $55.00 | $30.00 |
| Net cash | $49.00 | $24.00 |
| Effective take rate | 10.9% | 20.0% |

The take rate is the number a restaurant owner would bring to a contract
renegotiation, and one cancellation had almost halved it. The finding then
described the cancelled row as one that "carried a charge", which it did not.
The code's own comment said cancelled orders with a charge "stay as cost";
the code kept their food sales too.

The fix: a cancelled row's positive subtotal is set to zero before anything
is added up. Its charges still count as cost, a cancelled row with no charge
is dropped and counted, and a refunded row keeps its negative food sales
(the cancel test matches "Refunded", so this needed its own assertion). If the
platform did pay the restaurant for a cancellation, the payout column now
shows a gap against net cash, and the analyzer already reports that gap.

Three sibling analyzers (Turo, TikTok Shop and the settlement-style
creator tools) were checked for the same mistake. They handle cancellations
another way and do not have it.

## The seeded faults

Two campaigns seeded 28 mutants into `calc.mjs`; the suite caught 20. Three of
the 8 that got through change nothing a user can see (the example file's first
order id and start month, and a `records > 0` check that cannot be false at
that point). The other five were parser edges with no test: a lone `0xFF` byte
read as a UTF-16 byte-order mark, a semicolon file with "12.50" amounts that
no longer voted for a decimal point, and three-digit days and months
(`2026-06-011`) read as dates. One new test covers all five, so the catch rate
on non-equivalent mutants went from 80% to 100%.

The analyzer is free and runs in the browser; it is arithmetic on your file,
not accounting advice.
