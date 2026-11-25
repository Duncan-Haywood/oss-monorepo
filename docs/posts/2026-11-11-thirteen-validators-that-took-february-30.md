---
title: "Thirteen date checks that said yes to 30 February"
seo_title: "Date.parse accepts 2026-02-30: validating YYYY-MM-DD in JavaScript"
date: 2026-11-11
tags: [einvoice-preflight, fatturapa, dates, javascript, mutation-testing, redteam]
description: "Date.parse('2026-02-30') is 2 March in V8, and Number('+7') is 7. How thirteen date checks let bad dates through, and the lint and parity test that stop it."
---

Today's red-team run seeded eight faults into `fatturapa.mjs`, the
[e-invoice preflight](../../ventures/einvoice-preflight/) reader for Italian FatturaPA
files. The tests caught seven. The one that escaped changed a single entry in the
codice fiscale check table, the weight of the letter O in an odd position (11 became 12).
No test had a tax code with an O there, so a wrong check letter would have passed for
anyone named Orsi, Rossi or Romano. A new test uses `RSOPLA80A01H501S`, with its check
letter worked out by hand from the published table, and the rerun shows the mutant caught:
8 of 8.

Reading the file as an attacker turned up two real defects.

**30 February was a valid invoice date.** The check was the one most of us would write:

```js
/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
```

`Date.parse("2026-02-30")` is not `NaN` in Node or Chrome. It returns the timestamp for
2 March. Only a month over 12 or a day over 31 gives `NaN`. So 30 February, 31 April and
29 February in a common year all passed, both in the business rules (`IT-009`) and in the
schema check (`IT-021`) that every date field in the file goes through. The fix is a round
trip: build the date from its parts and check you get the same year, month and day back.

**A line with no VAT summary went unflagged.** FatturaPA wants one `DatiRiepilogo` for
every VAT rate and Natura code used on the lines. The checker compared each summary against
its lines, but never asked the reverse question, so an invoice whose 0% line had no summary
at all came back clean when the document total was left out. That is the new rule `IT-024`.
The bundled defects example now raises it too, which is right: one of its planted faults
strips a Natura, leaving a 0% line no summary covers.

## The same bug, twelve more times

A search for the pattern found it in twelve other places: the Polish FA(3) schema
check in the same product, the opening-balance date in the bookkeeper, the "today" field of
three EU regulation checkers and the UK working-from-home calculator, crew days off and
need-by dates in the wall framing scheduler, a proposal's expiry, rental ledger entries, and
the launch date the site build reads. Each now does the round trip, and the rental ledger
has its own test for 30 February, 29 February 2025 and 31 April.

Fixing thirteen copies by hand does not stop the fourteenth. `platform/ci/check_calendar_dates.py`
flags any line that shape-checks a YYYY-MM-DD string, trusts `isNaN(Date.parse(...))` and does
not round-trip it. On `main` before this change it found 15 lines; after, none. Its test also
asks Node whether `Date.parse("2026-02-30")` is still a number, so the lint says when it is no
longer needed. A sibling run today found the same rollover in the sales agent's reply sorter
through `Date.UTC`, which this lint does not cover; that one builds dates from parts, a
different shape. The next day's run found the hand-written shape of the same mistake, a
day range of 1 to 31 for every month, in seven more tools:
[Every month had 31 days](2026-11-12-every-month-had-31-days.md).

## The other way round: dates the round trip let through (2026-11-25)

A later red-team run found the opposite hole in the same product, in the one parser the
issue date, due date, invoice period and payment-terms checks all used. It did do the
round trip, but it found the parts with `Number(value.slice(5, 7))` after checking only
that the string was ten characters long with dashes at positions 5 and 8. `Number()` is
forgiving: `Number("+7")` and `Number(" 7")` are both 7, and `Number("-001")` is -1. So
`2026-+7-01`, `2026-07- 1` and `-001-01-01` came back as real dates, and an invoice with
any of them in its issue date passed `INV-003` in the web checker. The Python package,
which uses `date.fromisoformat`, rejected all three. The two sides also disagreed the
other way: `Date.UTC` reads years 0 to 99 as 1900 to 1999, so the web checker refused
`0050-01-01`, a valid date to the XML schema and to Python.

The fix is one parser instead of three copies: ASCII digits only (`[0-9]`, not a loose
`Number()`), year 1 or later, and `setUTCFullYear` instead of `Date.UTC`. `checks.mjs` and
`terms.mjs` now import it from `period.mjs`. The guard that keeps it fixed is
`date-parity.test.mjs`: it hands the same 3,031 strings (31 fixed, 3,000 seeded-random
near-dates) to the JavaScript parser and the three Python ones and fails on any
disagreement. On the old code it finds 141.

What this does not show: the rule codes are this tool's own, not SdI's, and none of this was
checked against SdI itself. It is an offline check of a file's shape and arithmetic, not
acceptance by the Agenzia delle Entrate and not tax advice.
