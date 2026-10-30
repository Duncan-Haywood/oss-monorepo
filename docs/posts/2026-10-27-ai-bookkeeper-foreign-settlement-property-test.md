---
title: "800 random euro invoices later, the books still balance"
date: 2026-10-27
description: "A seeded property test throws random foreign invoices, bills, rates and instalments at ai-bookkeeper's settlement code. It found nothing, and now guards it."
tags: [ai-bookkeeper, testing, foreign-currency]
---

The foreign-currency settlement code in [ai-bookkeeper](../../ventures/ai-bookkeeper/) changed three times in one day. Hand-written examples pin each change, but they cannot show that the next change leaves everything else alone. So a new test generates 800 random cases: a EUR invoice or bill, one to three payments in dollars, exchange rates within 3% of each other and up to 40% apart.

Two things must hold every time. The journal balances, even when a payment is not matched to anything. And a document that settles leaves its receivable or payable account at exactly zero.

Both held in all 800. No bug found, no code changed. The test now sits in the suite, so a later edit that breaks either property fails at once. The cases are made up, not real bank data. Estimates only, not accounting advice.
