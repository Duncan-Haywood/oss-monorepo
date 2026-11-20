---
title: "The 110% rule reads last year's AGI: three safe-harbor fixes in a freelancer tax tool"
seo_title: "1040-ES safe harbor: the 110% rule uses last year's AGI"
date: 2026-11-20
tags: [redteam, tax, 1040-es, testing, mutation-testing]
description: "A red-team run on a freelancer tax calculator: 11 of 24 seeded bugs escaped its tests, and three real defects hid in its 1040-ES advice. All fixed."
---

Today's red-team run targeted the
[US freelancer tax set-aside calculator](https://marisstella.app/us-freelancer-tax-set-aside-calculator/),
a page that tells a 1099 worker how much of each invoice to put aside and
what to pay each quarter on Form 1040-ES. It changed three times this week,
and freelancers act on what it says about money, so it was a good target.

## Seeded bugs: 13 of 24 caught

The red-team tool changes one line of `calc.mjs` at a time (a `>` turned
into `>=`, a `100` into `101`, `/` into `*`), runs the test suite, and puts
the line back. Over two campaigns, the suite caught 13 of the 24 changes.
The 11 that got through fall into three groups:

- **Edges nobody tested exactly.** The IRS wants estimated payments when you
  expect to owe *at least* $1,000, and allows the 110% safe harbor only when
  AGI is *more than* $150,000. Turning `>=` into `>` or `>` into `>=` changed
  nothing the tests could see. I searched for revenue figures that land on
  each edge to the cent ($7,077.34 gives exactly $1,000.00 of federal tax;
  $161,402.74 gives an AGI of exactly $150,000.00) and pinned both.
- **Numbers shown but never checked.** The share of profit, the quarterly
  figure, the "next $1,000" figure and the per-quarter text in the 1040-ES
  advice were displayed on the page but no test checked their values. Moving
  the top 35% bracket edge for joint and head-of-household filers by $1 also
  went unnoticed, because the edge test checked tax *at* the edge and not
  above it.
- **One validation hole.** Changing `||` to `&&` in the state-rate check let
  `abc` through, and the page would have shown NaN tax.

Each now has a test. The tool re-applied all 11 bugs, and each new test
caught its bug.

## Real defects: three, all in the estimated-payment advice

Reading the code with the IRS rules (Pub. 505, IRC 6654) open turned up
three defects. Earlier audits had listed two of them under the README's
"known gaps", but nobody had fixed them:

1. **The 110% test used this year's AGI.** The rule keys on *last* year's
   AGI. Someone whose income fell from $200,000 to $93,000 was told that
   100% of last year's tax was enough. That would leave them 10% short and
   facing a penalty. The page now has an optional "Last year's AGI" field.
   When it is blank, this year's AGI still stands in, and the advice now
   says so.
2. **$0 of tax last year still produced a demand for payments.** If last
   year's return covered 12 months and showed no tax, and you were a US
   citizen or resident all year, there is no underpayment penalty this year.
   The tool now says that, and still tells you to set the money aside,
   because the tax is still due in April.
3. **"Above the QBI line" appeared at zero taxable income.** A $5,000 gig
   was told its taxable income was over $201,750. The message now appears
   only when that is true.

Each fix began as a test that failed on the old code. The FAQ answer on the
page and its JSON-LD copy now describe the rule the same way. The
repository's FAQ-visibility check caught the mismatch when only one of them
had been edited.

## What the numbers say

On this file, the tests caught 54% of seeded bugs before today's work and
100% after. That is 24 mutants on one file, so it is not a portfolio-wide
rate. The pattern is the useful part. A calculator's tests tend to pin the
worked example and miss the legal thresholds, and the thresholds are where a
user gets penalised.

Not tax advice; verify on irs.gov.
