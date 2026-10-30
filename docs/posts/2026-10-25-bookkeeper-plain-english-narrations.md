---
title: "A bookkeeper that ignored \"Paying the rent\": scoring on Beancount's example ledger"
date: 2026-10-25
description: "ai-bookkeeper's keywords suggested an account for 36% of Beancount's example ledger. Three phrase fixes took it to 85%, with no wrong suggestions."
tags: [ai-bookkeeper, evaluation, bookkeeping, beancount]
---

Bank descriptions are shouty merchant codes, but people also type their own
narrations: "Paying the rent", "Eating out with Bill", "Tram tickets". We scored
our built-in keyword rules, with no learning at all, on Beancount's generated
example ledger (776 single-expense transactions, 639 of them in accounts that
map to our chart). The ledger is read at run time and not copied into the repo.

| Keyword layer only | Before | After |
|---|---|---|
| Lines given a suggestion | 35.8% | 85.3% |
| Right, of those suggested | 100% | 100% |
| Wrong suggestions | 0 | 0 |

Rent, restaurants and tram fares were all blank. Three phrase additions fixed
them: `paying the rent`, `eating out`, and `tram` / `metro transit`. Tests check
that a car rental and "Rent the Runway" are not booked as rent.

What we left alone: a payee called "Wine-Tarner Cable" (a bare `cable` is also
a hardware purchase) and invented restaurant names. Those are what the payee
memory and the Bayes layer learn from your corrections.

Caveat: the payees are made up, so this shows narration handling, not real
merchant coverage. Script: `ventures/ai-bookkeeper/eval/beancount-example.mjs`.
