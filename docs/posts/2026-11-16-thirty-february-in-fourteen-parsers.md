---
title: "30 February in fourteen parsers: red-teaming a late-payment calculator"
seo_title: "JavaScript Date rolls 2026-02-30 into March: finding it in 14 parsers"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, dates, lint]
description: "8 faults seeded in a UK late-payment calculator, 4 caught. Hunting found a projection counting days not yet late, and a 30 February bug in 14 parsers."
---

Today's red-team run seeded 8 faults into the
[UK late payment interest calculator](https://marisstella.app/uk-late-payment-interest-calculator/),
which works out statutory interest (8% over base rate) and the £40/£70/£100
fixed sum on an overdue business invoice. Its tests caught 4.

## What the tests missed

Three of the escapes sat on one line: the check that a typed base rate lies
between 0 and 30. Flipping `!==` to `===`, `&&` to `||`, or 30 to 31 all
passed, because no test typed a bad base rate. The fourth replaced
`asOf + n * DAY` with `asOf + n / DAY` in the 30/60/90-day projection, so every
projection date became today's date. No test read those dates. Two new tests
cover both; all 4 are now caught.

## Three real bugs in the calculator

**The projection counted days that were not yet late.** Set "today" to
21 July for an invoice due 31 July. The calculator rightly said nothing was
owed yet, but its "in 30 days" row (20 August) showed 30 days of interest. On
20 August the invoice is 20 days late, not 30. Each projection row now counts
its own days late, and adds the fixed sum only once that date is past due.

**The fixed sum appeared before the debt was late.** On the same not-yet-due
date the copyable summary said "Total claimable on top of the invoice:
£70.00". The page hid that line, but the summary did not. The fixed sum is now
zero until the invoice is overdue.

**30 February was accepted.** `Date.parse("2026-02-30T00:00:00Z")` is not NaN
in V8; it is 2 March. Type 2026-02-30 as the due date and the demand letter
said the invoice "fell due for payment on 2026-03-02". Smaller: "Infinity" was
accepted as an amount, and a base-rate box holding only spaces read as a 0%
base rate.

## The same bug in 13 more places

The repository already has a lint for the 30 February trap,
`platform/ci/check_calendar_dates.py`, added after earlier red-team runs found
it in a dozen validators. It only looked at one line at a time:
`isNaN(Date.parse(s))` on the same line as the date shape. The common way to
write a parser splits that over two lines:

```js
const date = new Date(`${value}T00:00:00Z`);
return Number.isNaN(date.getTime()) ? null : date;
```

I taught the lint that form (a date built in the six lines above an `isNaN`
test, with no round trip nearby). On the unfixed tree it flagged 14 files. Each
read 30 February as 2 March. Among them:

- the grant deadline and grant reporting trackers, which would schedule a
  report for 2 March;
- the weekly staff schedule maker, where 2026-02-30 rolls to Monday 2 March
  and so passed the "week start must be a Monday" check;
- four CSV readers (Stripe churn cohorts, failed-payment recovery, chargeback
  ratio, app review insights), which would file a row under the wrong month;
- the quarterly estimated tax calendar and the NY LLC Transparency Act
  tracker.

Each one now checks the parsed date round-trips to the same `YYYY-MM-DD`.
Behaviour tests in three of them fail without the fix, and the lint, which
already runs in CI, fails if a fifteenth copy lands.

## Numbers

- Seeded: 8. Caught by existing tests: 4 (50%). Caught after the new tests: 8.
- Real defects found: 4 in the calculator, plus 13 copies of the date one
  elsewhere. All fixed.
- One known blind spot: the lint accepts a parser if any round trip sits
  within a few lines, so a nearby helper such as
  `fmtDate = (t) => new Date(t).toISOString().slice(0, 10)` hides it. The
  late-payment calculator's own parser was missed that way. Its tests now
  cover it directly.

All of these tools are estimates, not legal, tax or financial advice.
