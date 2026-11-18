---
title: "It was tomorrow after 4 pm: 27 date tools that followed London's calendar"
seo_title: "toISOString today bug: 27 date tools defaulted to the UTC date"
date: 2026-11-12
tags: [ventures, quality, testing]
description: "A sweep loaded 109 date tools in UTC, Los Angeles and Kiritimati. 27 defaulted to tomorrow's date for US users each evening, and one rounded a deadline wrong."
---

Open the invoice maker at 9:30 on a Wednesday evening in Los Angeles and, until today, the invoice was dated Thursday. The late-payment calculators counted one more day late than the payer was. The deposit deadline checker started its clock a day early.

The cause is one line of JavaScript that most of us have written:

```js
const today = new Date().toISOString().slice(0, 10);
```

`toISOString()` gives the date in UTC. In Los Angeles that rolls over to tomorrow at 4 pm (5 pm in summer). In New York it happens at 7 pm, or 8 pm in summer. None of it shows up in tests, because CI runs in UTC, and so does almost every cloud session that writes these tools.

## The sweep

A new check, `platform/ci/check_timezone_drift.mjs`, loads every venture page with an `<input type="date">` (109 of them) in headless Chromium. It uses Playwright's fake clock and runs two tests:

- **Default date.** The page loads in Los Angeles at 15:30 and again at 21:30 on the same day, 4 March. If a date field's starting value changes between the two loads, it is following the UTC calendar, not the user's.
- **Drift.** At an instant that is 4 March in UTC, Los Angeles and Kiritimati (UTC+14), it fills the same dates in every date field and presses the Calculate-style button. Then it compares the page text across the three zones. A date-only answer should not depend on where the browser is.

The first pass flagged 28 pages. On 27 of them the default date was tomorrow in the evening: invoice, estimate and proposal makers, the expense tracker, rental ledger, COI expiry checker, Form 5500 and payroll deposit penalty calculators, the tenant deposit deadline checker and more. One flag was a false alarm. The SEPA file builder defaults to the *next business day*, which really is Thursday when it is Wednesday evening. Comparing two loads within one local day, instead of looking for the UTC date, stopped the check flagging it.

The drift test found one real case. The SaaS seat true-up counted "days since the notice deadline passed" from the current instant to local midnight and rounded the result. At 23:30 a deadline 2.98 days back read "passed 3 days ago". It now counts from today's local midnight. A new test in `calc.test.mjs` failed before the fix and passes after it.

## The fix

Every browser-side "today" now uses the local date:

```js
new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
```

The same idiom went into about 90 files: dated documents, as-of dates, backup file names and saved-bid dates. Three variants that shift a date before formatting it got the same treatment: a UK late-interest page, the sales cadence "next Monday" and a production timeline target. The `usage.js` analytics day buckets were left on UTC. A single clock for counting suits them.

After the fix the sweep reports 0 of 109 pages differ. Every changed venture's test suite passes.

## What it does not catch

The sweep only sees pages with a date field, and only what the page renders after one fill and one button press. A date computed in a report download, or behind a second step, can still drift. Pages that print a clock time or a time zone would differ for good reasons. The script says so, and every hit still needs a person to look.
