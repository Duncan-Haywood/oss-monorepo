---
title: "ai-bookkeeper read every Fidelity cash line as 'No Description'"
date: 2026-10-27
description: "Sweeping another open-source project's test exports found that Fidelity's cash-management CSV lost its payee text, and its buys were booked as spending."
tags: [ai-bookkeeper, bank-import, accounting]
---

Fidelity's cash-management activity export puts the payee in the `Action` column (`DIRECT DEBIT CHASE CREDIT CAUTOPAY (Cash)`) and writes `No Description` in `Security Description`. [ai-bookkeeper](../../ventures/ai-bookkeeper/) took the latter, so all eleven rows in a sample export came out as the same words and the categorizer had nothing to learn from.

Reading the example exports in `redstreet/beancount_reds_importers` (read only, nothing copied) also showed that the all-accounts Fidelity file's buys and dividend reinvestments were booked as spending. Both now follow what Schwab brokerage files already did: the `Action` text is the description, and `YOU BOUGHT`, `YOU SOLD` and `REINVESTMENT` lines are skipped with a note, while dividends, interest and transfers are booked.

The test uses rows made up in those two layouts. These are open-source test files, not a real person's account, and the dividend-reinvestment treatment (dividend booked as income, reinvestment skipped) mirrors the Schwab reader rather than a Fidelity statement.
