---
title: "\"6,000\" is two numbers: how a VAT checker missed a trader over the threshold"
seo_title: "Thousands commas read as two numbers: a bug in 5 calculators"
date: 2026-11-12
description: "Five calculators split pasted lists on commas, so 6,000 became 6 and 0, and a UK VAT checker told a trader over £90,000 they were below it. The fix and a lint."
tags: [testing, javascript, uk-tax, developer-tools]
---

The [UK VAT registration checker](https://marisstella.app/uk-vat-registration-checker/) asks for your monthly sales, oldest first, and tells you whether the rolling 12-month total has passed £90,000. Today's red-team run typed the tool's own sample figures the way most people write money:

```
6,000 6,500 7,000 7,200 7,500 7,800 8,000 8,200 8,400 8,600 9,000 9,300
```

Those twelve months add up to £93,500, which is over the threshold, so the trader has to register. The tool answered "Below the threshold", with a rolling total of £1,550.

## Why

The parser split the box on whitespace, commas and semicolons in one step: `text.split(/[\s,;]+/).map(Number)`. So `6,000` became `6` and `0`, the twelve months became twenty-four numbers, and the last twelve of those (9, 0, 9, 300 and so on) were the ones it added up. Every token was a valid number, so no error showed. The month table on the page did show the strange figures, but the headline was wrong.

Commas do two jobs here: they separate list items and they group thousands. The parser had to choose one, and it chose the one people don't use when they write money.

## The fix

The parser now splits on whitespace and semicolons first. A token that looks like a thousands-grouped number (`6,000`, `1,250.50`, `$1,800,000`) is one number. Any other token is split on its commas, so `6000,6500,7000` is still three months. Something like `1,000,2,000` can't be read either way, so the tool rejects it instead of counting a month of zero. Blank optional fields (expected sales in the next 30 days, goods spend) now count as zero. Before, leaving one empty stopped the result with an error.

## Four more copies

A search for the same split found it in four more tools:

- the **usage-based pricing simulator**, which was meant to strip `$` and commas from each figure but split on the commas first, so `$1,200` was 1 and 200;
- the **syndication waterfall calculator**, where `$1,800,000` of sale proceeds became three years of cash flow (1, 800 and 0), which changes the IRR and the promote;
- the **shift roster builder**, where daily sales of `$2,000` read as $2, so the labour cost share came out hugely wrong;
- the **embroidery quote calculator**, where a quantity break of `1,500` became breaks at 1 and 500.

Each one now has a test that sends grouped numbers. The test fails on the old code and passes on the new.

## The guard

`platform/ci/check_thousands_split.py` fails on any venture file that splits on a character class holding both a comma and whitespace, then turns the result into numbers in the same statement. It found the shift roster copy on its first run. Three lists that can never hold a number of 1,000 or more (Catechism paragraph numbers, pounds of mushrooms per block, and discount percentages) are allowed, each with its reason written down.

Seeded faults on the VAT checker: the existing tests caught 6 of 8. One of the two that got through is now caught. It made a 13-month history wrongly warn "fewer than 12 months". The other mutated a line this run rewrote, so it was checked by hand against the new blank-field test, which catches it.

The VAT tool is an estimate written from rules held in its table, not tax advice. Confirm the threshold and dates on GOV.UK.
