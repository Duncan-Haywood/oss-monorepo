---
title: "An 18-month year: the capital allowances a long period was losing"
seo_title: "Capital allowances for a period over 12 months: AIA, WDA, small pools"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, uk-capital-allowances-calculator, parcel-dim-weight-calculator, uk-tax, javascript, ventures]
description: "An 18-month sole-trader period got a 12-month AIA and short periods wrote off pools they should not: three UK capital allowances bugs fixed."
---

Today's red-team run seeded 12 bugs into the engine of the
[UK capital allowances calculator](https://marisstella.app/uk-capital-allowances-calculator/)
and 10 into the
[parcel dimensional weight calculator](https://marisstella.app/parcel-dim-weight-calculator/).
Reading the capital allowances engine as an attacker turned up three real
defects, two of them about one thing: how long the accounting period is.

## The real defects

**A long period got a short allowance.** The months field accepts 1 to 18,
but the engine worked out the Annual Investment Allowance and the
writing-down allowances with `Math.min(12, months) / 12`. For a sole trader
with an 18-month period of account, the law scales both *up*: CAA 2001
s51A(6) and s56(3) say the amount is "proportionately increased or reduced"
when the period is more or less than a year, and HMRC's own example
(Capital Allowances Manual, CA23085) gives an 18-month period a maximum AIA
of £1.5 million. The tool said £1 million. With £2 million of second-hand
kit, that is £500,000 of deduction it did not show.

**A short period wrote off pools it should not.** The small pools allowance
lets a main or special-rate pool of £1,000 or less be written off in one
go. The £1,000 is scaled by the period's length too (s56A; CA23225: a
17-month period has a limit of £1,417). The tool used a flat £1,000, so a
6-month period with an £800 pool wrote it all off, and said so, when the
right answer is 14% x 6/12 = £56.

**A company period over 12 months was accepted.** A Corporation Tax
accounting period cannot be longer than 12 months; a longer period of
account splits into a 12-month period and the months after it. The tool now
refuses a company period over 12 months and says how to split it, instead
of quietly capping it.

A smaller one: a profit field holding only spaces read as £0 profit, so
every claim was flagged as creating a loss.

The README had listed the first two as "not modelled yet". The page,
though, accepted the input and gave a confident wrong number, which is
worse than a missing feature.

## Seeded bugs

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `uk-capital-allowances-calculator/calc.mjs` | 12 | 5 | 12 |
| `parcel-dim-weight-calculator/calc.mjs` | 10 | 9 | 10 |

The capital allowances suite never checked the spend total, the tax saved
per year, a pool of £1, or the third year of the five-year projection, so
faults in any of them shipped green. The parcel tool's one escape was a
break-even height under one inch (a wide, light carton) being read as "no
height works".

## What it means if you used the tool

If your period was exactly 12 months, nothing changes. If it was shorter,
check whether a pool under £1,000 was written off. If you are a sole
trader or partnership with a 13 to 18 month period, run it again: the AIA,
writing-down allowances and small pools limit now scale up. As always,
the result is an estimate from the numbers you type, not tax advice;
confirm the rates on GOV.UK before filing.
