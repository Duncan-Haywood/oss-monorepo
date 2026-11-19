---
title: "A dollar sign outside the brackets turned refunds into income in 48 tools"
seo_title: "Excel's $(100.00) read as +100: accounting-negatives bug in 48 tools"
date: 2026-11-18
tags: [redteam, testing, csv, accounting, bugs]
description: "Our CSV parsers read ($100.00) as a negative and $(100.00) as a positive. Excel writes the second one. The fix, and the test that stops the pattern coming back."
---

Accountants write a negative number in parentheses: `(100.00)`. Most of the
free report analyzers in this repository know that. Each one tested for a
negative like this:

```js
const neg = /^\(.*\)$/.test(s);   // starts with "(" and ends with ")"
s = s.replace(/[^0-9.,]/g, "");   // then drop everything but digits
```

That works for `(100.00)` and for `($100.00)`. It fails for `$(100.00)`, and
Excel's Accounting number format writes exactly that when you save a sheet as
CSV: the currency sign sits outside the brackets. It also fails for
`(100.00) USD`. The string doesn't start with `(`, so the parser decides the
number is positive. Then it strips the `$`, the brackets and the letters and
returns **+100**. A refund, a fee or a chargeback gets added to income. The
row isn't flagged and nothing looks wrong.

**How we found it.** A red-team run seeded mutants into the revenue-recognition
tool `rev-rec` and then tried amounts a stranger might paste. `$(100.00)` came
back as a $100 charge. A grep turned up the same anchored test in about 60
venture files, so we wrote a probe that calls every exported `parseNumber`,
`parseMoney`, `parseAmount` and `parseCents` with six accounting-format
negatives. **48 tools** returned a positive number: the earnings analyzers
(Airbnb, Turo, Upwork, Fiverr, Etsy, eBay, Shopify, KDP, YouTube, Patreon and
more), two Schedule C categorizers, a Schedule E categorizer, payroll and sales
journal converters, rev-rec, a cash-application matcher and the economic-nexus
tracker. Two more tools, reseller-books and sales-export-to-journal, carry
byte-identical copies of seven of those parsers in an `engines/` folder. We
re-copied those, so the fix reaches them too. About ten others
returned `null` for the odd shapes, so they flagged the row and never gave a
wrong number.

**The fix** is one regular expression: a pair of brackets with a digit
inside, anywhere in the cell (`/\([^()]*\d[^()]*\)/`). `($100.00)`,
`$(100.00)`, `$ (100.00)`, `(100.00) USD` and `USD (100.00)` all read as −100
now. The test suites of all 52 ventures we touched pass.

**The guard.** `platform/ci/test_accounting_negatives.mjs` walks every
non-test `.mjs` under `ventures/` (its first version looked only at
`calc.mjs` and `csv.mjs`, missed the vendored copies, and found one more tool
once it looked everywhere). It finds each exported amount parser and checks that none of them reads
those six strings as a positive number. Returning `null`, returning `NaN` or
throwing is fine, because the tool then flags the row. A new tool copied from
an old one with the anchored pattern now fails CI. It doesn't wait for the
next red-team run.

The same run also seeded 20 mutants into `mrr-pulse` and `rev-rec`. The
existing tests caught 16. Two of the four that got through couldn't change any
output. The other two were real gaps, and both now have tests: a month that
starts at zero MRR returned `NaN` for net revenue retention instead of "no
rate", and a subscription worth one cent dropped out of the plan breakdown.
