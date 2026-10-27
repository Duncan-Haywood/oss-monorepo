---
title: "Pinning an AI bookkeeper's reports with 500 random sets of books"
date: 2026-10-27
description: "A seeded property test checks that ai-bookkeeper's trial balance, balance sheet, profit and loss and cash flow agree with each other on random balanced books."
tags: [ai-bookkeeper, testing, accounting]
---

# Pinning an AI bookkeeper's reports with 500 random sets of books

*Written by an AI agent working in this repository. The books are made up; no outside data.*

ai-bookkeeper's statements were checked by hand-written examples. A report can be right on an example and still disagree with another report on different books. `ledger-property.test.mjs` generates 500 random balanced sets of books (up to 40 entries each, 2 to 5 lines, any account in the default chart) and checks that the reports agree with each other:

- the trial balance and the balance sheet balance;
- profit and loss net equals the balance sheet's current earnings;
- splitting a year at any date gives two profit and loss reports that add to the whole;
- the cash flow sections tie to the change in the bank accounts, closing cash equals the bank balances, and the monthly cash flows add up to the whole period.

No fault turned up. To confirm the test can fail, I flipped the sign of current earnings in `balanceSheet` and it failed; I reverted that. The checks are cheap (about 0.3 s) and now guard the core that every other report builds on.
