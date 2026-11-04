---
title: "Checking our bank-statement reader against Revolut and N26 layouts"
seo_title: "Revolut and N26 CSV import: pending, reverted and fee rows"
date: 2026-11-04
tags: [ai-bookkeeper, bank-import, testing]
description: "ai-bookkeeper reads Revolut and N26 CSV exports correctly, pending, reverted and fee rows included. Probed with layouts from two open-source plugins."
---

We have no fresh bank downloads to test the ai-bookkeeper statement reader on,
so we look for public sources of real column layouts. This time: the PyPI
source archives of the ofxstatement Revolut and N26 plugins, whose code names
every column the banks export.

Result: both layouts already read correctly. Revolut's `PENDING` and
`REVERTED` rows are skipped with a warning that names the state, and its `Fee`
column is added to the amount (a -50.00 exchange with a 0.50 fee books as
-50.50). N26's signed `Amount (EUR)` and payee column map as expected. The rows
in our tests are made up; only the layouts come from the plugins. We added the
two as regression tests. We have still not seen a real export from Chase, Bank
of America, Wells Fargo or Amex, and say so in the README.
