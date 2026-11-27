---
title: "An e-invoice validation API for software vendors, priced per invoice: €1.40 per 1,000, €0.04 with errors"
seo_title: "XRechnung and ZUGFeRD validation API pricing, per invoice"
date: 2026-11-27
tags: [einvoice-preflight, for-customers, e-invoicing, xrechnung, factur-x, zugferd, peppol, api]
description: "How the metered e-invoice API bills a software vendor: €19 monthly minimum, €1.40 per 1,000 clean invoices, €0.04 per invoice with errors explained."
---

If you sell invoicing or accounting software in Germany or France, your users
will soon be sending structured e-invoices. That means XRechnung, ZUGFeRD,
Factur-X, UBL or CII files, and sometimes those files get rejected. You can
build EN 16931 validation and error messages yourself, or you can call an
API. The API behind [E-invoice Preflight](https://marisstella.app/einvoice-preflight/)
now has a plan built for that second case. Here is how it bills, so you can
work out a price before you integrate.

## The rates

| What happened to the invoice that month | Price (excl. VAT) |
|---|---|
| Checked, no errors (it passed, or had warnings only) | €1.40 per 1,000 |
| Checked, errors found: every error explained in German, French, Dutch or English, with safe fixes where you ask for them | €0.04 |
| Monthly minimum | €19, credited against that month's usage |

Three rules decide what you pay:

- **An invoice counts once a month.** The API identifies a file by the
  SHA-256 of its bytes. If your user fixes a field and checks again, the
  changed file is a new invoice. If your user checks the same file five
  times, it is still one invoice.
- **Errors are counted once.** An invoice is billed at €0.04 if any check of
  it that month found errors. Later checks of the same file don't change that.
- **The minimum is a credit, not a fee on top.** If you use €12 of checks in a
  month, you pay €19. If you use €25, you pay €25: €19 at the start of the
  month and the other €6 with your next renewal.

A worked month: 10,000 invoices, of which 300 had errors. That is 9,700 × €0.0014
= €13.58, plus 300 × €0.04 = €12.00, so €25.58 in total. That is €6.58 above
the minimum.

## What your integration sees

Every metered response carries `x-usage-amount-cents`, the month's amount so
far before the minimum, next to the usual usage headers.
`GET /v1/billing/usage?period=2026-11` returns any month's statement:
invoices validated, invoices explained, each amount, and whether the month has
been billed yet. You can show your own customers what their e-invoice checks
cost without keeping a second meter.

There are safety caps of 200,000 invoices and 20,000 AI-written explanations
a month. They are there to stop a runaway loop, and they aren't price tiers.
If you need more, ask. Explanations for the built-in rules come from fixed
templates, so they are the same every time. The model only writes text for
the long tail of rules that have no template, and it never decides whether an
invoice is valid. Deterministic code makes that call.

## Where it stands

This is early access. The plan, the meter and the month-end billing are built
and tested, but paid plans are not on sale yet. The terms of service now say
how the minimum and usage billed after the month work (section 5). The prices
above are the ones published on the pricing page, and we'll tell you before
any change applies. Not done yet: a way to ask for plain validation of a file
with errors at the €1.40 rate, and automatic billing on the first of the
month.

If you build invoicing software and want early access, email
hello@marisstella.app. This is not tax advice: a check tells you what the
rules say about a file, not how to account for it.
