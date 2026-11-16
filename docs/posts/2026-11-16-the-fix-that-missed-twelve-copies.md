---
title: "The fix that missed twelve copies"
seo_title: "A CSV line-number fix whose CI guard missed 12 analyzers"
date: 2026-11-16
tags: [ventures, redteam, csv, testing]
description: "A fix for drifting CSV line numbers came with a CI check that knew one loop shape, so 12 analyzers kept the bug. The shapes it missed and the new check."
---

This morning a red-team run [fixed the line numbers](2026-11-16-one-blank-line-moved-every-error-message.md)
that the free report analyzers on [marisstella.app](https://marisstella.app/)
show when they skip a row. The bug: the shared CSV parser drops blank lines and
keeps a quoted line break inside one field, so a row's position in the parsed
table isn't its line in the file. One blank line in an export, and every
"line N skipped" after it pointed at the wrong row.

That fix tagged every row with the line it starts on, updated 41 loops to read
the tag, and added a CI check so the bug couldn't come back. A second red-team
pass this afternoon found that 12 analyzers still had it.

## How it turned up

The second run seeded ten small faults into the
[Stripe churn and cohort analyzer](https://marisstella.app/stripe-churn-cohort-analyzer/)
and ran its 43 tests against each one. The tests caught none of the ten. One of
the faults turned `line: r + 1` into `line: r + 2` on a skipped row, and
nothing noticed. That looked wrong, because the parser in that file already had
the morning's line tag. The tag was there, but the loop never read it:

```
a Stripe export: header, one good row, two blank lines, then a row with "garbage" for a date
skipped: [ { line: 3, reason: 'unreadable start date' } ]   // the row is on line 5
```

## Why the check passed

The morning's check looked for one shape of code:

```js
for (let i = h + 1; i < table.length; i++) {
  const lineNo = i + 1;
```

The analyzers it missed wrote the same mistake in three other ways:

- `skipped.push({ line: r + 1, ... })` inline, with the loop variable called
  `r` (eight analyzers: the Stripe churn and failed-payment tools, Airbnb,
  Amazon PPC, App Store reviews, Google Ads, Meta Ads, Shopify discounts);
- `table.slice(1).forEach((r, n) => { const line = n + 2;` (the on-call load,
  pg_stat_statements and Postgres index tools);
- `parseCsv(raw).forEach((row, i) => ... line: i + 1` (the restaurant menu-mix
  cost list).

## The new check

Matching one spelling was the weak part. The replacement in
`platform/ci/csv_line_numbers.mjs` finds every `line: v + 1` (or `+ 2`,
`line =`, `lineNo`) in a file that holds the parser, walks back to the loop
that binds `v`, and fails unless that loop runs over text split on newlines
(where the index really is the line) or the code reads the tag first
(`table[r].line ?? r + 1`). Run against `main` before the fix, it named all
12 files. It passes after. It has its own tests: each of the three missed
shapes must fail it and each fixed shape must pass.

Of the 20 faults this run seeded in the Stripe churn analyzer and the
[subscription audit](https://marisstella.app/subscription-audit-from-statement/),
the tests caught 4. After 17 new tests, every fault that can change what a
user sees is caught. Three were equivalent: code that can't change any output.

The lesson for the next guard is simple: test it against the code you found,
not only the code you expected. The morning's check worked on the one example
it was written from, so it looked complete. Running it over every file in
`main` and seeing it pass while the bug was still there would have shown the
gap.
