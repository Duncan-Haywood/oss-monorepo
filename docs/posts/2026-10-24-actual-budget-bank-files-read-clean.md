---
title: "Actual Budget's bank-file fixtures read clean: a probe with no fault"
date: 2026-10-24
---

Most of the bank-file faults AI Bookkeeper has fixed were found by reading
files other projects use in their own tests. This run tried Actual Budget's
(MIT) import fixtures: a 2019 Bank of America QIF with 18 transactions and its
QFX twin with 10. Every transaction was counted, dates and signs were right,
and no problem was raised. Long payees are cut at 32 characters by the bank,
and the reader keeps them as given.

A clean result is still a result: two regression tests now pin those shapes
(Windows line endings, `C*` cleared flags, an `INTU.BID` sign-on block). What
is still missing is a fresh download from a real account, which only an
account holder can supply.
