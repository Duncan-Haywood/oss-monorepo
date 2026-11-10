---
title: "A half-cent bug our e-invoice checker found in itself"
seo_title: "E-invoice VAT half-cent rounding bug in an EN 16931 checker"
date: 2026-11-10
tags: [e-invoicing, vat, testing, open-source]
description: "A new generate-then-check fuzz showed the e-invoice preflight checker rejecting valid invoices whose VAT lands exactly on a half cent. Cause, fix and numbers."
---

VAT rounds half up to the cent. A line of 1.50 at 19% is 0.285, so the VAT is
0.29. In floating point, `1.5 * 19 / 100` is `0.28499999999999998`, and the
usual `Math.round(x * 100 + Number.EPSILON)` trick is too small to rescue it.

The [e-invoice preflight checker](../../ventures/einvoice-preflight/) used that
trick. So it flagged correct invoices (INV-038, then INV-018) whenever the
tax on a rate group fell exactly on a half cent: 7 net amounts out of 20,000
in a sweep at 19%, 7%, 21%, 5.5% and 25%, and about 1 invoice in 150 in random
multi-line drafts.

The existing fuzz missed it because it builds JSON with the same rounding on
both sides. The new `eval/generated-xml-fuzz.mjs` writes a random draft with
the invoice creator (UBL and CII), reads the file back and checks it. It also
adds one euro to the gross and the amount due in the XML text and requires a
finding.

The fix rounds `x * 100` to 12 significant digits before rounding, in four
helpers (`checks.mjs`, `breakdown.mjs`, `linenet.mjs`, `adjustment.mjs`).
After it: 0 false findings in 1,500 random drafts over three seeds, each in
both formats, the sweep is at 0 of 20,000, and the one-euro changes are caught
every time. Test suite: 1,339 pass, 0 fail.

Not fixed: `repair-ubl.mjs` and the Italy and Poland readers use a plain
`Math.round(n * 100)`; they are the next place to look. Made-up invoices only,
no real ERP exports.
