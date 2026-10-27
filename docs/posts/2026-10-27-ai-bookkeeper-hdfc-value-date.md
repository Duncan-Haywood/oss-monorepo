---
title: "A truncated column header booked a 110 rupee debit as a 30,523 credit"
date: 2026-10-27
description: "Sweeping an open-source finance app's Indian bank fixtures through ai-bookkeeper found three import faults, one of which changed the amount."
tags: [ai-bookkeeper, bank-import, india]
---

HDFC's fixed-width text statement heads its value-date column `Value Dat`, cut off at nine characters. [ai-bookkeeper](../../ventures/ai-bookkeeper/) strips a trailing three-letter currency code from headers (`Amount USD`), and it read `dat` as a currency, so the column became `Value`, an amount alias. With a real Debit and Credit pair beside it the file booked ₹110.00 out as ₹30,523.00 in, with no warning.

Same sweep of Paisa's sample files (AGPL, read at run time, nothing copied) turned up two smaller faults: SBI's `Value Date` was preferred over `Txn Date`, and the line `**This is a computer generated statement...` was glued onto the last transaction's description. All three are fixed and pinned in tests with made-up rows; the full suite (1,591 tests) passes. None is checked against a real statement yet, and a real HDFC or SBI export is still the thing that would add signal.
