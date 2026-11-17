---
title: "31 January plus one month is 3 March: a date bug in six tools"
seo_title: "JavaScript add months bug: setMonth rolls 31 Jan to 3 March"
date: 2026-11-14
tags: [javascript, dates, linting, ci, fba-reimbursement-claim-finder, soc2-readiness-checker]
description: "setUTCMonth(getUTCMonth() + 1) on 31 January gives 3 March. A new lint found that bug in six tools, one an Amazon claim deadline set too late."
---

Ask JavaScript for "31 January plus one month" the obvious way and you get
3 March:

```js
const d = new Date("2026-01-31T00:00:00Z");
d.setUTCMonth(d.getUTCMonth() + 1); // asks for "31 February"
d.toISOString().slice(0, 10);       // "2026-03-03"
```

`Date` doesn't refuse a day that's out of range. It rolls it forward, so
"31 February" becomes 3 March (2 March in a leap year). `Date.UTC(y, m + 1, d)`
does the same thing. Anyone whose start date is the 29th, 30th or 31st gets
a date up to three days into the following month.

Most calendar libraries clamp instead. 31 January plus one month is
28 February, and 31 August plus six months is 28 February. A few tools here
already did this
([grant-deadline-tracker](../../ventures/grant-deadline-tracker/calc.mjs),
[cancel-flow](../../ventures/cancel-flow/flow.mjs)): go to day 1, move the
month, then set the day to the smaller of the original day and the new
month's length.

## What the sweep found

A new lint, `platform/ci/check_month_overflow.py`, looks for two shapes. The
first is a one-argument `setMonth`/`setUTCMonth` that adds months, with no step
to day 1 before it and no clamp after it. The second is a
`Date.UTC(y, m ± n, day)` whose day is neither a literal nor clamped. It skips
the usual `m - 1` you write when parsing a 1-based month. On the 1,373
ventures it started with 25 hits. Tightening the parse-offset rule and
skipping demo days that can't go past the 28th brought that to 8. Six were
real bugs:

| tool | what drifted | effect |
|---|---|---|
| [FBA reimbursement claim finder](../../ventures/fba-reimbursement-claim-finder/) | end of the inbound claim window | with the default 9-month window, a shortage from 31 May showed as claimable until 3 March; the window closes 28 February |
| [SOC 2 readiness checker](../../ventures/soc2-readiness-checker/) | Type II report date | a Type I ready on 31 August, plus a 6-month window, showed 3 March |
| [Sales call notes desk](../../ventures/sales-call-notes-desk/) | "in 1 month" follow-ups | a call on 31 January got a task due 3 March |
| [Client concentration risk analyzer](../../ventures/client-concentration-risk-analyzer/) | start of the trailing window | a one-month window ending 31 March started on 4 March and left out three days of invoices |
| [e-invoice preflight](../../ventures/einvoice-preflight/) (CFDI payroll) | seniority check | a worker who started 31 August was flagged for claiming six months on 28 February |
| [Rev-rec](../../ventures/rev-rec/) demo data | monthly billing periods | demo invoices ran "31 Jan to 3 Mar", which no real subscription does |

The FBA one matters most, because its error ran the risky way. A deadline
that's late is worse than one that's early: the seller sees "claim" while
the window has already shut. Each of the five logic fixes has a test with dates like the ones in the
table, and each of those tests fails on the old code. The rev-rec demo now
anchors billing to the start day the way a subscription does (31 Jan, 28 Feb,
31 Mar), and its existing tests still pass.

The other two hits were already safe and now carry a `month-overflow: ok`
comment. The COBRA calculator takes `Math.min` of the overflowed date and the
19th month's last day. The meeting action-item parser rejects any day that
rolled over.

## What the lint skips on purpose

Year steps. `setFullYear(y + 1)` on 29 February gives 1 March. For a one-year
anniversary some rules want 28 February and some want 1 March, so that's a
call to make tool by tool, not something a lint should flag.

## How it stays fixed

There's no workflow edit. `platform/ci/unwired_checks.py` runs every
`check_*.py` and `test_*.py` in `platform/ci/` that no workflow names, so the
new lint and its tests run on every pull request starting with the one that
added them.
