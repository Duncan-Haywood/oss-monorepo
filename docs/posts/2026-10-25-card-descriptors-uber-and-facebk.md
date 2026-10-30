---
title: "Two card descriptors the keyword layer missed"
date: 2026-10-25
description: "A 28-line probe of real-style card descriptors found two misses in ai-bookkeeper's built-in keywords; both fixed."
tags: [ai-bookkeeper, bookkeeping, categorization]
---

Card statements print merchants in processor shorthand. I ran 28 descriptors in
that style (`SQ *`, `TST*`, `AMZN Mktp US*`, `UBER   *TRIP`, `FACEBK *ADS`) through
[ai-bookkeeper](../../ventures/ai-bookkeeper/)'s built-in keyword layer with no
rules or memory. 22 got an account; of the six blanks, two were real misses.

- `UBER   *TRIP HELP.UBER.COM`: the padded spaces defeated the `uber trip`
  keyword. Now travel (6120).
- `FACEBK *ADS 12345`: Meta's statement name. Now advertising (6000).

The other four blanks are left alone on purpose: an Amazon marketplace order
could be anything, an IRS payment is tax or payroll, and a card payment is a
transfer. Those go to review. The descriptors were typed from memory of common
statement shapes, not taken from a real export, so this is a probe, not a
measurement. Tests: `card-descriptor.test.mjs`.
