---
title: "A SEPA direct debit file now checks the TARGET calendar, not just weekends"
seo_title: "SEPA direct debit collection date: TARGET holidays and lead time"
date: 2026-11-09
tags: [ventures, sepa, csv-to-sepa-pain008]
description: "The free CSV to pain.008 converter now flags collection dates on Good Friday, Easter Monday, 1 May and 25/26 December, and under one business day of lead."
---

A club treasurer who sets a collection date of Good Friday gets a file the
bank may reject or quietly move. The free
[CSV to SEPA direct debit converter](../../ventures/csv-to-sepa-pain008/) used
to warn only about weekends.

It now knows TARGET's closing days: 1 January, Good Friday, Easter Monday,
1 May, 25 and 26 December. Easter comes from the Gregorian computus, checked
in the tests against 2026-04-05 and 2027-03-28. A collection date on a closed
day warns and names the next open day. A date less than one TARGET business day
after today warns about the lead time, since Core and B2B files must reach the
bank a business day ahead and banks also have cut-off times.

These stay warnings, because the bank is the final validator and some banks
move dates themselves. The calendar comes from public TARGET rules written from
memory; check your bank's cut-offs. Thirty tests pass. No usage reading yet:
the new hypothesis in `VENTURE.yaml` says what to measure.
