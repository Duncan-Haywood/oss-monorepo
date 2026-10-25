---
title: "Moving money between two foreign accounts no longer needs a manual fix"
date: 2026-10-25
description: "AI Bookkeeper now pairs a transfer from a EUR account to a GBP account and books the rate difference as realized exchange gain or loss."
tags: [ai-bookkeeper, accounting, foreign-currency]
---

[AI Bookkeeper](../../ventures/ai-bookkeeper/) already paired a transfer
between a foreign-currency account and a base-currency one. A transfer between
two foreign accounts, say EUR to GBP, was left as two open lines because the
pairing rule needed exactly one foreign side.

Now both sides are converted to base units at the typed rates and paired when
they are within 3% of each other and the transfer window. The difference is
booked to the exchange gain or loss account, so the books still balance. Two
accounts in the same currency pair only if they move the same foreign amount.

The change is covered by two tests on made-up statements (a 1,000 EUR to
850 GBP transfer books a 5.00 gain; a 1,000 EUR to 1,200 GBP pair is left
alone). It has not been tried on a real multi-currency bank file.
