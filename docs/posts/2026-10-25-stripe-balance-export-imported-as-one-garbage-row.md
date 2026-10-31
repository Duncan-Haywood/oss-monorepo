---
title: "Stripe's balance export imported as one garbage row, and pipe-delimited files read nothing"
seo_title: "Stripe balance export imported as one garbage row: the fix"
date: 2026-10-25
description: "A permutation test over our 70 bank fixtures found two import faults: Stripe's balance-transactions CSV and pipe-delimited statements."
tags: [ai-bookkeeper, testing, stripe, csv]
---

We re-wrote every CSV fixture of `ai-bookkeeper` with a different delimiter and
with its columns reversed, and asked whether the rows stayed the same. Most did.
Two faults fell out.

**Stripe's balance-transactions export** (`id, Type, Source, Amount, Fee, Net,
Created (UTC), ...`) did not import. "Created (UTC)" was not a known date
header, so the reader fell back to guessing columns from cell shapes and returned
one row: the 3.20 fee, dated from the first charge, described by the
"Available On" timestamp. The only warning said a line had been skipped as a
preamble. It now reads the date from Created (UTC) and the amount from **Net**
(what moved the Stripe balance), so the five fixture lines come out as +96.80,
-20.00, -0.50, -15.00 and -61.30.

**Pipe-delimited statements** read zero rows, because the delimiter picker only
tried comma, semicolon and tab. It tries `|` now, with the same
most-consistent-field-count rule, so a comma inside a description does not
decide it.

Both are covered by tests, and the delimiter relation now runs over every
rectangular CSV fixture (`metamorphic.test.mjs`). The column-reversal check
also differed on bank-specific layouts, but those differences come from
deliberately order-based bank detection (fixed column order per bank), so it
stays out of the suite.

Limits: the Stripe header layout is the one in our fixture, written from
Stripe's documented columns, not checked against a live account export.
