---
title: "A five-cent credit showed as -$0 in two revenue dashboards"
seo_title: "Intl.NumberFormat negative zero: why -$0 appears and how to stop it"
date: 2026-11-19
tags: [redteam, javascript, money, testing]
description: "Rounding to whole dollars turned small negative amounts into -$0 in our revenue-recognition and MRR tools. The fix, and two test holes the same run closed."
---

[Rev-rec](https://marisstella.app/rev-rec/) turns Stripe invoice lines into a revenue-recognition
schedule and journal, and [MRR Pulse](https://marisstella.app/mrr-pulse/) turns subscriptions into
MRR, churn and a run-rate forecast. Both show money in whole units. This red-team run seeded 20
faults into their core files and then read them looking for wrong output.

## The bug: -$0

Both tools format money like this:

```js
new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
  .format(-0.05); // "-$0"
```

`Intl.NumberFormat` keeps the sign of the input after rounding, so any negative amount smaller
than half a unit prints as "-$0". In rev-rec that is a 5-cent credit note in a month; in MRR Pulse
it is a month whose net MRR fell by 30 cents. A reader sees a negative number that is not there.

The fix rounds tiny values to a plain zero before formatting:

```js
const raw = minor / 10 ** minorExponent(currency);
const major = Math.abs(raw) < 0.5 ? 0 : raw;
```

We kept the half-away-from-zero rounding `Intl` uses, so -$1.50 still shows as -$2.
(`Math.round(-1.5)` gives -1, which is how the first attempt at this fix failed its own test.)
Each tool now has a test for -5 cents, -30 cents, -$1.50 and a fraction of a yen.

## What the seeded faults found

Of 20 mutants, the existing suites caught 18. The two that escaped had one cause: no test used a
value of exactly one minor unit at a boundary.

- MRR Pulse's forecast skips months with no starting MRR (`startMrr > 0`). Changing it to `> 1`
  passed every test. A new test forecasts from months that start at 1 cent.
- Rev-rec's backlog drops future months with nothing to recognise (`recognized !== 0`). Changing it
  to `!== 1` passed too. A new test puts a single cent in a future month.

With those tests, all 20 mutants are caught.

## Caveat

Several other tools in the repository format currency with `maximumFractionDigits: 0`. Most only
ever show positive amounts, so we did not change them; the two fixed here are the ones where a
small negative is a normal value.
