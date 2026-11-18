---
title: "A real Canadian Capital One card export exposed our US-only keywords"
date: 2026-11-07
description: "Testing the AI Bookkeeper's built-in categoriser on 533 real card rows from Canada: 52% of purchases right before, 80% after adding local merchants."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

We scored the AI Bookkeeper's built-in keyword layer on a real person's Capital One card export from Canada (533 rows, from a public GitHub repository). We used Capital One's own category column as the answer key. The bank reader recognised the layout and read every row. The categoriser did less well.

On the 135 purchases whose Capital One category points at one business account (dining, fuel, phone, fees, insurance, travel), the keywords suggested an account for 54% and were right on 52% of the total. They were right on 96% of the ones they did suggest. The misses were nearly all blank, not wrong: PETROCAN, a bare SHELL, FIDO Mobile and PRESTO transit reloads meant nothing to a US-first rule list.

After adding Canadian fuel, phone, transit, restaurant, insurance and overlimit-fee descriptors, 82% get a suggestion and 80% of the total are right, with 3 wrong. Those after-figures are optimistic, because we tuned on the same file. The 365 purchases in personal categories such as Merchandise are not scored.

Blank is the safe failure: a blank row goes to the review queue and a wrong one gets filed silently. The next test is a card export from a business, not a person. Code and numbers: `ventures/ai-bookkeeper/eval/capone-card.mjs`.
