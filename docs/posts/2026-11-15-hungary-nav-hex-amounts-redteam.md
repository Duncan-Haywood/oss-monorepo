---
title: "A comma in one amount blamed the wrong total. Red-teaming the Hungarian NAV reader"
seo_title: "NAV Online Számla checker: one bad amount, a wrong totals warning"
date: 2026-11-15
tags: [testing, mutation-testing, e-invoicing, hungary, javascript, redteam]
description: "12 faults seeded into the NAV Online Számla reader, 8 caught. One amount written 4352,40 made a totals warning blame a correct total; now the sums stand down."
---

Today's red-team run aimed at the Hungarian reader in
[einvoice-preflight](https://marisstella.app/einvoice-preflight/), which landed
on `main` this morning. It checks a NAV Online Számla 3.0 `InvoiceData` file
(or a `manageInvoice` request carrying them) against NAV's blocking error codes
and the arithmetic behind NAV's warnings, offline in the browser.

## Seeded faults: 8 of 12 caught, now 11 of 11

`redteam.py campaign` seeded 12 faults into `hungary-nav.mjs`, one at a time,
and ran the suite after each. Four got through:

- Turning off the check of a summary row's VAT against its rate, and the check
  of the same VAT against its lines. Neither had a test. One new test sets the
  27% row's VAT to 4000.00 where both 27% of 16120.00 and the two 27% lines say
  4352.40, and expects both warnings.
- Shrinking the float slack in the tolerance from 1e-9 to 1e-10. NAV tolerates
  rounding "up to 1% ... never less than one unit". At forint magnitudes,
  6702 x 310 x 1.01 lands about 1.9e-10 past 1% in binary floats, so the
  smaller slack would warn on an amount that is exactly inside NAV's
  tolerance. A test now pins that case, and a 2% case that must still warn.
- `netHUF || 1` in place of `netHUF || 0` in the summary sum. That branch runs
  only when the row's forint net is missing, and then the sum is never read.
  Triaged as equivalent.

`redteam.py rerun` re-applied the three gaps against the new tests: all caught.

## Real defects: what a stranger can type

Reading the module as an attacker turned up two real defects.

**Amounts that are not decimals.** The reader parsed every amount with
`Number()`. That reads `0x10FE` as 4350 and `1e3` as 1000, and treats
`4352,40` (a Hungarian decimal comma), `NaN` and `1e400` as missing. NAV's
schema rejects all of them: every amount is `MonetaryType`, an `xs:decimal`.
With the 27% row's VAT written as `4352,40`, the reader said "invoiceVatAmount
is 4502.40 but the summaryByVatRate rows add up to 150.00", which blames a
correct total and quotes a sum the file never states. A hex amount passed clean.

While this run was fixing it, another session landed a full schema gate for
the same reader (HU-027..032, checked against xmllint on NAV's samples). It
now names the bad amount as HU-030. It did not stop the misleading sum: the
"rows add up to 150.00" warning still came out beside it. So the fix here
narrowed to that. Amounts are read only in `xs:decimal` form, and when any
decimal-typed element in an invoice is unreadable, the HU-020..026 sums for
that invoice are dropped and listed under `skipped` with the reason, leaving
the schema finding to stand alone. (The first version of this fix added its
own rule for the bad amount; after merging the schema gate it would have said
the same thing twice, so it was taken out.)

**An exchange rate of 0 or below.** `ExchangeRateType` is `minExclusive 0`.
On a currency outside NAV's monitored bands, a rate of 0 produced 19
forint-conversion warnings. The schema gate now names the rate; the reader no
longer converts at it, so that one finding is the whole report.

On NAV's 30 published samples and the 27 seeded fault kinds in
`eval/hungary-nav-mutations.mjs`, the output before and after the fix is
identical.

## The class, not the instance

The Polish, Italian, Spanish and Mexican readers in the same product already
had a schema rule for this (PL-015, IT-021, ES-021, MX-003); the Hungarian one
was the reader that missed it. A new test, `number-lexical.test.mjs`, feeds
`0x10`, `1e3` and `12,50` to all five readers and expects each one's schema
rule (HU-030 for Hungary). It would have failed on this morning's Hungarian reader, so the next national reader
added without the rule fails CI rather than waiting for a red-team run.

This is an offline check of a file, not NAV's acceptance and not tax advice.
