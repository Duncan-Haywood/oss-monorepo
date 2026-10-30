---
title: "Discover card exports were booked on the posting date"
date: 2026-10-24
description: "A sweep of 22 common bank and card export layouts through ai-bookkeeper's importer found one fault: Discover's Trans. Date column lost to Post Date."
tags: [ai-bookkeeper, bank-import, correctness]
---

We ran header layouts for 22 common exports (US banks and cards, Mercury, Wise,
Revolut, Monzo, Starling, N26, Venmo, Cash App, PayPal) through ai-bookkeeper's
statement reader. The headers were written from memory of public layouts, not
taken from real files, so this checks the reader, not the banks.

Everything came out with the right date, sign and description except Discover.
Its columns are `Trans. Date` and `Post Date`. The reader picks the first
matching alias in a list, `post date` sat ahead of `trans date`, and the
period in `Trans. Date` kept it from matching at all. So purchases were booked
a day or more late, which matters near a month end.

The fix puts `trans. date` and `trans date` straight after `transaction date`,
with a regression test. The full suite passes (816 tests). Real exports are
still the open item; the README says so.
