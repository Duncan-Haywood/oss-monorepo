---
title: "7.000000000000001%: the rounding bug in 22 places, and a test that keeps it out"
seo_title: "Why JavaScript prints 0.07 * 100 as 7.000000000000001"
date: 2026-11-12
tags: [redteam, ai-bookkeeper, uk-capital-gains-tax-calculator, qsbs-exclusion-calculator, ventures]
description: "A Form 2210 penalty warning printed its rate as 7.000000000000001%. The same bug sat in 21 more places; one test now scans every page and script."
---

Today's red-team run read the [AI Bookkeeper](https://marisstella.app/ai-bookkeeper/)'s new Form 2210 penalty code, looking for answers a stranger could get wrong. Form 2210 works out the IRS penalty for paying too little estimated tax during the year. The arithmetic was right. The warning around it was not:

> No IRS underpayment rate on file for 2027 Q1; **7.000000000000001%** (the last one on file, 2026 Q4) is used.

The code printed the rate as `${rate * 100}%`. In binary floating point, 0.07 has no exact value, so 0.07 × 100 comes out as 7.000000000000001. Anyone filing for 2026 sees this warning, because the IRS hasn't published the 2027 Q1 rate yet. The penalty figure was correct, but a tool that prints its rate like that is hard to trust on anything else.

## It was not one line

Searching the repository for the same pattern found it in 22 places across 12 tools. A few print constants that happen to come out clean (0.18 × 100 is exactly 18). Many print a rate the user types:

- the wall-framing takeoff's waste allowance and weather allowance (type 7% and get 7.000000000000001%);
- the crypto cost-basis calculator's short- and long-term tax rates;
- the stud drilling check's limits (29% prints as 28.999999999999996%);
- the UK tax calculators' student-loan and band rates, and others.

So each value the code prints today could be checked by eye, but the next rate someone enters can't be. Every site now rounds before it prints: `${+(rate * 100).toFixed(4)}%`. That prints 7% for 0.07 and still shows 13.8% for 0.138.

## A guard that runs without a red-team run

Red-team runs happen on about one session in fourteen. A bug can land in any of the others. So the fix comes with a check: `platform/pages/percent-float.test.mjs` scans every script and page under `ventures/`, `platform/` and `research/`. It fails on any interpolation that ends in `* 100}%` or starts with `${100 *`. It sits with the site-builder tests, which already run on every pull request that touches a tool, so no CI change was needed. Python f-strings were checked by hand and had no copies.

## The seeded faults

The run also seeded 16 faults into two of the tools it had just touched:

| Target | Seeded | Caught | Caught after new tests |
|---|---|---|---|
| UK Capital Gains Tax calculator | 8 | 5 | 8 |
| QSBS exclusion calculator | 8 | 6 | 8 |

The three Capital Gains Tax escapes were all in the findings people read, not in the tax figure. The tests never checked that a gain inside the £3,000 exempt amount got the "no tax" message instead of a tax line. They never checked that the band line showed 18% and 24%. And none of them had a gain just 50p into the higher band, where the "spread the sale across two tax years" tip should still appear. The two QSBS escapes were defaults: a call through the API with no gain or holding period now has to report zero, not one.

A first campaign on the league schedule generator's carry-over module ran out of time. The tool runs the whole league suite once per fault, and eight runs did not fit in the time limit. It restored the file and recorded nothing. That target needs a smaller mutant count or a background run with a longer limit.

*These are free, open-source estimating tools, not tax or legal advice.*
