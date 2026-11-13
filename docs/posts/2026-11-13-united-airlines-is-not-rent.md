---
title: "A United Airlines refund is not rent: red-teaming three tax calculators"
seo_title: "Schedule E categorizer: refunds no longer counted as rental income"
date: 2026-11-13
tags: [testing, mutation-testing, schedule-e, rental-property, crypto, cost-basis, redteam]
description: "Twenty-four faults seeded across three tools, nineteen caught. Reading the code turned up a rent pattern that booked airline refunds and bank interest as rental income."
---

Today's red-team run seeded 24 faults into three files the repository's tests
guard: the usage counter of [Visit Keeper](../../ventures/visit-keeper/), the
[Rental Property Schedule E Categorizer](../../ventures/rental-property-schedule-e-categorizer/)
and the [Crypto Cost Basis Calculator](../../ventures/crypto-cost-basis-calculator/).
`redteam.py campaign` changes one operator or constant at a time, runs the
file's tests and then restores the file.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `visit-keeper/usage.mjs` | 8 | 7 | 1 | 7 of 7 |
| `rental-property-schedule-e-categorizer/calc.mjs` | 8 | 5 | 0 | 8 of 8 |
| `crypto-cost-basis-calculator/calc.mjs` | 8 | 6 | 0 | 8 of 8 |

## The real bug: rent matched inside other words

The Schedule E categorizer sorts every credit on a bank statement. A credit
whose description matches its rent pattern goes on line 3, rents received.
That pattern contained `unit\s?\w+`, `lease` and `rental` with no word
boundaries, so:

| Credit | Booked as | Should be |
|---|---|---|
| UNITED AIRLINES REFUND | rent | not categorised |
| COMMUNITY BANK INTEREST | rent | not categorised |
| ESCROW SURPLUS RELEASE | rent | not categorised |
| RENTAL CAR REFUND | rent | not categorised |

"Un**it**ed" and "comm**unity**" each contain `unit` followed by a letter, and
"re**lease**" contains `lease`. On a statement with a $300 airline refund and
$12 of interest, the tool reported $312 more rental income than the landlord
received. The tool's own rule is that a row with no clear category stays out of
the totals until you say where it goes. These rows broke that rule without any
warning.

The fix adds boundaries: `\bunit\b`, `\blease` and `\brental(?!\s+car)`.
"UNIT 4B RENT JAN", "LEASE PAYMENT 12 OAK" and "RENTAL INCOME OAK ST" still
count as rent. The built-in sample statement categorises exactly as it did
before. A new test holds four lookalike credits and four real rent credits.

## What the tests missed

- **Rental income.** No test had both rent and a late fee, so the tests still
  passed when `rent + other_income` became `rent - other_income`. A new test
  checks that $1,000 rent plus a $50 late fee comes to $1,050.
- **"Security" credits.** A refund for a security camera could have been filed
  as a security deposit and nothing would have failed.
- **Cents.** The dollar formatter could print three decimals unnoticed.
- **Crypto swaps priced per coin.** A swap row with a price column and no total
  is valued at price times quantity. Dividing instead of multiplying passed
  every test.
- **Donating coins that lost value.** If the coins are worth less than you paid,
  giving them away avoids no capital-gains tax. A mutant that reported
  $0.15 of "tax avoided" on a loss went through.

The one equivalent mutant is in Visit Keeper's storage guard. When the
browser blocks site data, every later read and write is already wrapped in its
own `try`, so the guard's return value changes nothing a visitor can see.

These tools give estimates from the numbers you enter. They are not tax advice.
