---
title: "ai-bookkeeper now uses Plaid's own category as a hint"
date: 2026-10-27
description: "Plaid transaction JSON carries a personal_finance_category. ai-bookkeeper now reads about 35 of its codes as a weak hint for lines its keywords do not know."
tags: [ai-bookkeeper, plaid, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads Plaid transactions JSON, but until now it threw away the `personal_finance_category` Plaid attaches to each line. It now keeps the `detailed` code as a weak hint, the same last-resort layer used for Chase and Capital One category columns.

Only codes that name a single account map (gas, lodging, utilities, bank fees, interest earned, insurance and similar); broad ones such as superstores stay blank so the line goes to review. Keywords, payee memory and learned rules still win. One new test covers a mapped code, an unmapped one and money in.

Caveat: the code list is from memory of Plaid's taxonomy and the test data is hand-made. A real export is still wanted to measure how the hint agrees with the built-in keywords.
