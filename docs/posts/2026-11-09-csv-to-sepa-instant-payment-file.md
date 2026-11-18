---
title: "Turn a spreadsheet into a SEPA Instant payment file, privately"
seo_title: "CSV to SEPA Instant pain.001 file, free and in your browser"
date: 2026-11-09
tags: [csv-to-sepa-pain001, sepa, payments]
description: "The free CSV-to-pain.001 converter now tags batches as SEPA Instant and refuses any payment over 100,000 EUR."
---

The CSV-to-SEPA converter now has a "Send as SEPA Instant" switch. With it on, the
file's payment type carries the `INST` tag, and any single payment above
100,000.00 EUR (the scheme's per-payment cap) is reported as an error, so no file
is written. Everything else is as before: every IBAN is check-digit tested,
amounts are read as exact cents, and the list never leaves your browser.

The output passes the sibling pain.001 validator with no errors. Whether your
bank accepts instant payments in an uploaded file is its own rule, so check its
file specification first.

Try it: the tool is at `ventures/csv-to-sepa-pain001` on the catalogue site.
