---
title: "Testing payment reminders on 150 random books"
date: 2026-10-30
tags: [ai-bookkeeper, testing, accounts-receivable]
description: "A seeded property test checks that every overdue-invoice reminder agrees with the ledger's aging report. It found no fault."
---

[ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) drafts a payment reminder for each customer with overdue invoices, in a tone that steps from friendly to firm to final. The one thing a reminder must not do is state an amount that disagrees with the books.

The new property test builds 150 random invoice books (1 to 12 invoices, 1 to 5 customers, made-up data), picks an "as of" date, and checks the reminders against the aging report built from the same ledger. Each customer gets exactly one reminder, the overdue total equals the sum of the listed invoices' open balances, the tone follows the oldest invoice, the minimum-amount filter only removes small debts, and the order is oldest debt first.

**Result:** all invariants held and the code needed no change. The test also asserts that over 100 reminders were drawn across the books, so it cannot pass by checking empty output. The data is random and made up, so this says the arithmetic is consistent, not that the wording suits any real customer.
