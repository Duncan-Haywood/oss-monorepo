---
title: "$0.00 is not a loss. Red-teaming the restaurant delivery commission analyzer"
seo_title: "Float noise: a delivery commission calculator read break-even as loss"
date: 2026-11-15
tags: [testing, mutation-testing, restaurants, javascript, redteam]
description: "12 faults seeded into the delivery commission analyzer, 8 caught. A hand search found two break-even cases the page called losses, from float noise. Both fixed."
---

Today's red-team run aimed at
[the restaurant delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/),
which reads a DoorDash, Uber Eats or Grubhub payout CSV and works out the real
take rate, net per order after food cost and packaging, and whether promotions
paid for themselves. Its engine, `calc.mjs`, changed three times in the last
two days. `redteam.py campaign` seeded 12 faults into it, one at a time, ran
the suite after each and restored the file.

The suite caught 8 of 12.

## What got through

| Fault | Why the tests missed it |
|---|---|
| A cell needs four letters, not three, to count as text when guessing the decimal format | no test had a three-letter word ("Ref 1.25") next to an amount |
| One digit after a decimal comma ("12,5") no longer counts as a comma vote | every test used two digits |
| The promotions total subtracts instead of adds | only the combined spend was checked, never promotions and ads apart |
| "Delivery lost money overall" fires at exactly zero | no file broke exactly even |

Each now has a test that fails with the fault and passes without it. With
them the same 12 faults are caught 11 of 12 times when re-applied (the twelfth
is the fourth row, whose line the fix rewrote; applied by hand to the new
line, the new test catches it too).

## What was really wrong

The last row pointed at the bug. The per-order loss check already had a
half-cent tolerance (`netAfter < -0.005`), but the overall check compared the
summed net with zero directly. Three orders of $10.10 with a $0.30 commission
and $9.80 of packaging each break exactly even, yet in floating point they sum
to −0.0000000000000053. The page then said both "No order lost money after food
cost and packaging" and "Delivery lost money overall … Net after costs is
$0.00".

The promotions finding had the same flaw. With profit before the spend equal to
the spend, the ratio came out as 0.9999999999999911, under 1, so the page
flagged it high: "they left $1.00 of profit per $1 spent … the spend cost more
than these orders earned".

Both now compare at the cent, and the promotion result carries its profit in
dollars so the finding does not have to rebuild it from a ratio. A restaurant
owner deciding whether to keep a promotion should not be told it loses money
when the numbers on the same line say it broke even.

## A second target: the missed-call text-back webhook

A second campaign drew `twilio.mjs` in
[missed-call text-back](https://marisstella.app/missed-call-textback/), the
self-hosted server that checks each incoming Twilio webhook's signature. Seven
faults, six caught (three of those only because the suite hung until its
300-second limit, not because a test failed). The one that got through matters:
turning `!authToken || !header` into `!authToken && !header` made the check
accept a request signed with an empty key whenever the server ran with an empty
auth token and signatures required, and an empty-key HMAC is something anyone
can compute. The shipped code was right; nothing tested that branch. It has a
test now.

## The general lesson

Any finding that decides a sign or a threshold from a sum of money should round
to the cent first, the same way the page prints it. If the printed number and
the verdict next to it can disagree, eventually they will.
