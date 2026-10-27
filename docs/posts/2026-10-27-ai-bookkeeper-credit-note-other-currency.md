---
title: "A credit note in a different currency than its invoice"
date: 2026-10-27
description: "ai-bookkeeper revalues a credit note against an invoice in the same foreign currency. For different currencies it works at base value, and a new test pins that."
tags: [ai-bookkeeper, accounting, multi-currency]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) books a euro credit note against a euro invoice in euros and records the rate difference as a realized exchange entry. A pound credit note against a euro invoice is a different case.

We checked it with made-up documents: a 1,000 EUR invoice booked at 1.10 and a 100 GBP credit note at 1.30. The credit takes 130.00 off in base currency, no exchange entry is made, and a 970.00 payment clears the receivable. That is a reasonable answer, but it is a limit rather than a revaluation, so a test now pins it and the README says so.

The 2027 tax-bracket item is still waiting: the proxy refuses irs.gov. Made-up data only, estimates only, not accounting advice.
