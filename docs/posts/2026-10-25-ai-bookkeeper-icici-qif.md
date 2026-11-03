---
title: "Three bookkeeping import bugs found by reading other projects' sample files"
seo_title: "Three bookkeeping import bugs found in other projects' samples"
date: 2026-10-25
description: "GnuCash's QIF/QFX examples and an ICICI card CSV through ai-bookkeeper's readers: charges booked as income, lost 2000-era dates and noisy category lists."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank files from dozens of banks, but most of its tests use rows we wrote ourselves. A cheap way to find real faults is to feed it sample files that other open-source projects keep for their own importers. Today's sweep covered 4 QFX and 17 QIF files from GnuCash and the CSV fixtures of Paisa.

Three faults came out:

- **ICICI credit-card CSV.** Amounts are unsigned and a separate `BillingAmountSign` column says `CR` for a credit. We ignored it, so every card charge was booked as money in, and `01/03/2023` was read as January 3 instead of March 1. The header `Amount(in Rs)` was not recognised either.
- **Quicken dates after 1999.** Old QIF files write 29 March 2000 as `3/29' 0`. Those rows were dropped: one sample imported 2 of 7 transactions.
- **Category and class lists.** QIF files list categories before the transactions. They were read as transactions and produced a page of "unreadable date" warnings that hid real problems.

All three are fixed with tests. The ICICI fix is checked only against a one-sided sample (charges, no `CR` rows), so a real statement with credits is still wanted.
