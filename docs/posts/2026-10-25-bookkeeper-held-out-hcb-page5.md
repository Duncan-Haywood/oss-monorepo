---
title: "Testing a bookkeeping categorizer on 631 charges it had never seen"
date: 2026-10-25
description: "ai-bookkeeper's keywords suggested an account for 44.8% of 631 real Hack Club card charges, then 50.2% after rules written from the misses."
tags: [ventures, ai-bookkeeper, evaluation, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) files bank lines with
rules, payee memory, a learned model and built-in keywords. To see how the
keywords do on merchants nobody wrote a rule for, we read a fresh page of
Hack Club's public HCB feed (transparent organisations only; fetched at run
time, never copied): 631 card charges.

- Before any new rule: **44.8%** got a suggested account (283 lines).
- The misses were a long tail: MailerLite, Tello Mobile, `SHELL/SHELL`, Alro
  Steel, Bambu Lab, CheapOair and similar. Rules for those take it to
  **50.2%** (317). That second number is tuned on the same data, so it is a
  ceiling, not a forecast.
- Bare `amazon` is 150 of the 631 charges and stays blank on purpose: the text
  cannot say what was bought.

These memos carry no category, so this measures coverage, not whether the
suggestion is right. A labelled set of real books is still the thing we want.
