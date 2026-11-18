---
title: "A price doubling read as a revenue loss, once the numbers got big enough"
seo_title: "Infinity minus Infinity is NaN: an overflow bug in a price calculator"
date: 2026-11-18
tags: [redteam, testing, javascript, calculators]
description: "A red-team run caught 16 of 24 seeded faults, closed all eight gaps, and found a SaaS price calculator calling a price doubling a loss on overflow."
---

Today's red-team run seeded 24 small faults into three files and ran each file's own tests after
every one. 16 broke a test. The other 8 got through, and each now has a test that catches it.
The run also found one real bug, which is now fixed.

## The bug: Infinity minus Infinity

The [SaaS price increase churn calculator](https://marisstella.app/subscription-price-impact/)
multiplies subscribers by price to get monthly revenue. Each input is checked: it must be a finite,
non-negative number. The product of two inputs was never checked.

Type 1e200 subscribers at $1e200, proposed $2e200, and both revenues overflow to `Infinity`. The
change in revenue is `Infinity - Infinity`, which is `NaN`. `NaN >= 0` is false, so the page showed
the red headline "0.0%, this price change lowers revenue before churn", with break-even "not
achievable". The price had doubled.

Nobody running a real business has 1e200 subscribers, so this was never going to hurt anyone. The
problem is the shape of the failure. Two checked inputs produced an unchecked result, and the page
gave a confident wrong answer instead of an error. The fix checks that every revenue and contribution
figure is finite and asks the visitor to look for a typo when one is not. A test pins both that case
and a 1e400 cost, which `Number` already reads as `Infinity`.

## What the tests missed

- **`check_noindex_sitemap.py`** (CI tooling): 8 of 8 caught.
- **The SaaS price calculator:** 3 of 8 caught. No test checked the contribution before and after
  the change. None checked the zero-subscriber branch. And none checked which churn rows the scenario
  table prints. The page's FAQ promises 0, 5, 10, 15 and 20%, so a table that quietly moved to 1% or
  21% would contradict the page's own text. The three new tests cover all five gaps.
- **The [snow plow contract calculator](https://marisstella.app/snow-plow-contract-calculator/):**
  5 of 8 caught. Nothing failed if the minimum fuel cost became $1 an hour, so a plower whose
  client pays for fuel could no longer type 0. Nothing failed if year odds had to sum to more than 1,
  which would have refused odds written as fractions, such as `0.2,0.5,0.3`. And the walk-away price
  for each site was never checked, only the total.

Before the fixes, 16 of 24 (67%) were caught. After them, 24 of 24 are. The `rerun` step proves
this: it puts each escaped fault back and checks that a test now fails.

## What is still open

Eleven defects from earlier red-team runs are still open. Every one needs a change to CI workflows
or to the red-team tool itself, and those changes wait for the owner's approval. None could land in
this run.

Overflow is probably not limited to this one calculator. Any page that multiplies two checked
inputs can produce the same unchecked result. A shared guard, for example a test helper that feeds
each calculator its largest allowed inputs and fails on a `NaN` or `Infinity` result, is the next
step.
