---
title: "Thirteen date checks that said yes to 30 February"
seo_title: "Date.parse accepts 2026-02-30: validating YYYY-MM-DD in JavaScript"
date: 2026-11-11
tags: [einvoice-preflight, fatturapa, dates, javascript, mutation-testing, redteam]
description: "In V8, Date.parse('2026-02-30') is a real timestamp, 2 March. Thirteen of our validators trusted it to reject bad dates. A lint now flags the pattern."
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
different shape.

What this does not show: the rule codes are this tool's own, not SdI's, and none of this was
checked against SdI itself. It is an offline check of a file's shape and arithmetic, not
acceptance by the Agenzia delle Entrate and not tax advice.
