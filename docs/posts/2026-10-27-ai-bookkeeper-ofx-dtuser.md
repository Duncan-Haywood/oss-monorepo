---
title: "An OFX file with no posting date lost its interest line"
date: 2026-10-27
description: "Kresus's checking.ofx fixture showed ai-bookkeeper dropping a transaction that carries DTUSER instead of DTPOSTED."
tags: [ai-bookkeeper, bank-import, testing]
---

Sweeping the sample files of Firefly III's importer, Maybe/Sure and Kresus through [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s reader found one fault. Kresus's `checking.ofx` has a "Credit Interest Paid" line of +19.90 that carries `DTUSER` and no `DTPOSTED`. The reader wanted `DTPOSTED`, so it skipped the line as an "unreadable date" and the interest never reached the books.

The date now falls back to `DTUSER`, then `DTAVAIL`. `DTPOSTED` still wins when present. The test is `kresus-ofx.test.mjs`, with made-up rows; the Kresus file (MIT) was read from a clone at run time and not copied.

Also checked, no fault: Maybe/Sure's Mint, YNAB, Actual and generic transaction CSVs. Their Mint fixture mixes signs with a debit/credit column, which no real Mint export does; a Mint-shaped file with unsigned amounts reads correctly. Firefly III's importer repo and Akaunting ship no bank-file fixtures.
