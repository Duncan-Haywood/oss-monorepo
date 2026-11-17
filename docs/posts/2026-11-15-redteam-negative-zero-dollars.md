---
title: "\"-$0.00\" in 425 calculators. Red-teaming the stump grinding bid calculator"
seo_title: "Why a money formatter prints -$0.00, and the one-line fix"
date: 2026-11-15
tags: [testing, mutation-testing, javascript, redteam, formatting]
description: "18 faults seeded, 9 caught. A money formatter signed the raw number but printed the rounded one; the same line was in 705 places in 425 tools."
---

Today's red-team run drew
[the stump grinding bid calculator](https://marisstella.app/stump-grinding-price-calculator/)
at random. It takes a list of stump diameters and your grinder's speed,
crew, truck and overhead costs, then works out a bid, a break-even price and
how your usual per-inch quote compares.

## Seeded faults: 9 of 18 caught

`redteam.py campaign` seeded 8 faults into the page's on-device usage counter
and 10 into the pricing engine, `calc.mjs`. The suites caught 9.

The six that got through in the engine all had the same cause. A number was
computed and returned, but no test checked its value:

- the profit on the bid (`price - direct - overhead`) was never read by a
  test, so flipping the overhead subtraction to an addition went green;
- break-even was only compared with another output, so multiplying by
  `(1 - overhead)` instead of dividing passed;
- the "Medium (maple, cherry, ash)" row could be priced at twice the hardness
  and the only check (softwood is cheaper than rotten wood) still held;
- the even split used when no stump has any minutes to weigh by was never
  exercised;
- the quote check's profit was only checked to be less than the bid price;
- `money()`, the whole-dollar formatter, had no test at all.

Each now has a test that pins the number, and `redteam.py rerun` re-applied
every escaped fault: all are caught now. The three counter faults were the
same ones earlier runs met in other copies of that file. A repository-wide
contract (`platform/ci/usage_contract.mjs`) already runs all 998 identical
copies, so this run added the cases to this venture's own suite and moved on.

## The real defect: "-$0.00"

Writing the test for `money()` turned up a bug:

```js
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
money2(-0.001) // "-$0.00"
```

The sign comes from the raw number and the digits from the rounded one. Any
amount between -$0.005 and $0 prints as a negative zero, and the whole-dollar
version does the same for anything between -$0.50 and $0. A bid whose profit
works out a fraction of a cent below zero reads as a loss of nothing. It is
small, but it is the kind of thing that makes a reader trust the other
numbers less.

The fix signs the text after rounding, so only text that still has a
nonzero digit gets a minus sign:

```js
export const money2 = (n) => ((t) => (n < 0 && /[1-9∞]/.test(t) ? "-$" : "$") + t)(Math.abs(n).toFixed(2));
```

## 705 copies

The shape was not just in this calculator. Searching for "sign from a
`< 0` test, then a formatted absolute value" found 705 formatters in 425
tools, in a dozen spellings: `"-$" : "$"`, `"-" : ""` followed by `"$"`,
`"£"`, `"GBP "`, cents divided by 100, `toFixed`, `toLocaleString`. A
small script rewrote each one to the form above. Every one of the 425 tools'
test suites passed afterwards, and the 115 edited inline page scripts were
checked to still parse. 56 of the 705 do no rounding,
so they could never print a negative zero; they were rewritten anyway so the
code reads the same everywhere.

## So it stays fixed

`platform/ci/check_negative_zero_money.py` fails on the old shape when the
text after it rounds. On the old copies of the touched files it reports 649
hits; on the tree now, none. It runs on every pull request through
`unwired_checks.py`, which picks up new `platform/ci/check_*.py` scripts by
itself, so no workflow change was needed. Its tests also run the recommended
replacement in Node and check what it prints for -0.001, -0.005, -12.30,
-1,234.6, minus infinity and NaN.

Catch rate on today's 18 faults: 53% before, 100% after (one fault, in a
`try`/`catch` branch whose result no caller can see, was marked equivalent).
