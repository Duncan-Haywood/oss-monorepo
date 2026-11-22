---
title: "A shop selling only protection plans was told its services lose money"
seo_title: "Break-even with protection plans: a bug in 4 repair-shop calculators"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, phone-repair-shop-profit-calculator, changepoint-detector, javascript, ventures]
description: "Red team run: 4 of 10 seeded bugs caught in the phone repair calculator, all six gaps closed, and a break-even bug fixed in four sibling calculators."
---

Today's red-team run drew the
[phone repair shop profit calculator](https://marisstella.app/phone-repair-shop-profit-calculator/)
at random and seeded ten bugs into its `calc.mjs`. The suite caught 4. One that
got through flipped season revenue from "services plus protection plans" to
"services minus protection plans", and no test noticed.

## The real bug: break-even ignored plan customers

While reading the file, we found a real problem that was not one of the seeded
bugs. The calculator works out break-even as fixed costs divided by contribution,
multiplied by the number of **jobs**. The contribution includes the prepaid
protection plans, but the job count did not include the plan customers. Take a
shop that sells only plans, for example 400 customers at $120 who each come in
once:

- if rent puts it at a loss, it was told *"the services do not cover their own
  labor and materials, so more volume makes it worse."* That is wrong. Each
  plan earns about $60 over its cost, so more volume makes the loss smaller.
- if it makes a profit, it was told *"Break-even is about 0 paid jobs; you plan
  0."*

The same code is in three sibling calculators built from one template: the
[shoe repair](https://marisstella.app/shoe-repair-shop-profit-calculator/),
[tailor and alterations](https://marisstella.app/tailor-alterations-shop-profit-calculator/)
and [upholstery](https://marisstella.app/upholstery-shop-job-profit-calculator/)
shops (with repair packages and trade accounts in place of plans). All four now
count every paid sale. The advice reads "paid jobs and plan customers" when a
shop sells plans and "paid jobs" when it does not. Each fix has a test that
failed before it.

A second, smaller fix in the phone calculator: a plan visit's cost included the
warranty redo rate but its bench hours did not, so a plan-heavy shop's bench use
came out low.

## Seeded bugs: 4 of 10 caught, then 10 of 10

| Escaped mutant | Test added |
|---|---|
| `careHolders` subtracted in the "any sales?" check | a shop with plans only is valid input |
| season of exactly 0.5 months rejected | the documented minimum is accepted |
| plan revenue subtracted from season revenue | revenue = services + plans |
| break-even `* jobs` became `/ jobs` | the break-even sentence is checked exactly |
| a bench at exactly 100% reported as over | 100% reads as full, not over |
| share link wrote `undefined` for empty fields | unset fields stay out of the link |

## One more: accented Plausible goal names

We also read the Plausible Analytics source that was
[added to the changepoint detector](https://marisstella.app/changepoint-detector/)
yesterday. A goal named `Réservation` produced the column
`goal_re_servation`. Unicode normalisation splits `é` into `e` plus an accent
mark, and the code turned the mark into an underscore. The mark is now
dropped, so the column is `goal_reservation`. A goal name with no Latin letters
at all (for example Chinese) still can't name a column. The error used to say
the name had "no letters or digits", which was false. It now tells you to add
a goal with a Latin name in Plausible.

*Statistical and arithmetic tools, not financial advice.*
