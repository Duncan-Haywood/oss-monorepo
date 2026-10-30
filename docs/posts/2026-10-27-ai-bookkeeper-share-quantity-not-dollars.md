---
title: "ai-bookkeeper stops booking 10 shares as $10"
date: 2026-10-27
description: "A bank-style CSV with an amount like '10 AAPL' used to import as ten dollars. It is now reported instead of booked."
tags: [ai-bookkeeper, bookkeeping, csv-import]
---

While sweeping the public test CSVs of ledger-cli through [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s statement reader, one file had an Amount column reading `10 AAPL` (a share purchase). The reader dropped the letters and booked $10.00, with no warning. In books, a wrong number that looks fine is worse than a refusal.

A four- or five-letter capital ticker after the number now makes the amount unreadable, so the row is reported for you to fix. Three-letter currency codes (`-1.00 USD`, `15 EUR`) and `DR`/`DEBIT` markers read as before. A known gap remains: `15 EUR` next to a `14 USD` cost column is read as 15.00 and the cost is ignored.

Checked on the 16 ledger-cli CSVs plus two unit tests; the rows in the tests are made up. Estimates only, not accounting advice.
