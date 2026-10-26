---
title: "ai-bookkeeper now matches a euro invoice to euro payments in euros"
date: 2026-10-27
description: "A EUR invoice paid in two EUR deposits used to leave the receivable open because deposits were matched on their dollar value. They now match in euros."
tags: [ai-bookkeeper, accounting, multi-currency]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) matches bank lines to invoices and bills. With a foreign-currency bank account, it compared each deposit's dollar value to what the invoice carried. A 1,000 EUR invoice booked at 1.10 and paid by 400 and 600 EUR after the rate moved to 1.20 failed that test: the first deposit counted as 480.00 against 1,100.00 carried, the second matched nothing, and the receivable stayed at 720.00 while the aging report said 620.00.

Lines in the invoice's own currency now match in that currency. Each part-payment takes its euros at the booking rate, the gap to what the bank recorded goes to realized exchange (a 100.00 gain in this case, split over the two payments), and the deposit equal to the euro balance closes the invoice.

Checked on three made-up cases and the existing suite, not on a real multi-currency ledger. Estimates only, not accounting advice.
