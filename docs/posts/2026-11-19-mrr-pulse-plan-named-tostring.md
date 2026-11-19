---
title: "A Stripe price called toString: seven test gaps and one real bug in MRR Pulse's Stripe reader"
seo_title: "MRR Pulse red team: Stripe price nicknames and JavaScript object keys"
date: 2026-11-19
tags: [saas, stripe, mrr, testing, redteam]
description: "Twelve seeded faults in MRR Pulse's Stripe reader, 5 caught. A plan or id named toString or __proto__ broke the per-plan split. All fixed."
---

[MRR Pulse](../../ventures/mrr-pulse/) is a self-hosted MRR dashboard that
reads your Stripe subscriptions with a read-only key. Today's red-team run
aimed at `stripe.mjs`, the 63 lines that turn a Stripe subscription into a
monthly amount. No red-team run had targeted it before.

## Seeded faults: 5 of 12 caught

`prompts/redteam.py` made twelve small changes to the file, one at a time,
and ran the venture's tests after each. Five failed a test. Seven got
through, and each one would have shown a founder a wrong number:

| fault that got through | what a founder would see |
|---|---|
| `paused && active` became `paused \|\| active` | every active subscription read as paused, so MRR showed 0 |
| a legacy item with only `plan`, no `price` | that line counted as $0 |
| `interval_count` 3 on `recurring` ignored | a quarterly price read as monthly, at 3x |
| an amount-off coupon counted as 1% off | MRR 1% low on those subscriptions |
| per-plan lines subtracted, or divided by the net | the plan breakdown was wrong while its total still added up |
| one request past `maxPages` | one Stripe call more than the limit |

The plan-breakdown cases got through because a rounding fix-up moves any
leftover onto the largest line, so the total always matched even when every
line was wrong. The existing test checked only the total. Each fault now has
a test that fails with it, and the rerun confirms all seven are caught
(12 of 12).

## The real bug: names that JavaScript already uses

A price nickname is free text the founder types in Stripe. MRR Pulse keyed
its per-plan totals by that text in a plain `{}`. A plain object already has
keys: `toString`, `constructor`, `hasOwnProperty` and `__proto__`. So:

- a price nicknamed `toString` gave that plan `NaN` in the breakdown;
- a price nicknamed `__proto__` disappeared, and its money moved to another plan;
- from a CSV import, a subscription with id `toString` counted as neither new
  nor reactivated MRR (the movement code thought it had seen it before), and
  one with id `__proto__` dropped out of MRR completely. In the plan breakdown, `__proto__` also wrote
  `mrr` and `subs` onto `Object.prototype` for the whole server process.

Nobody is likely to name a plan `__proto__`, but anyone can, and the CSV
importer accepts whatever ids a spreadsheet holds. The fix stores
user-keyed maps either with no prototype (`Object.create(null)`) or with
own-property reads and writes (`has()` and `put()` in `metrics.mjs`). The
saved state file is plain JSON, so reads check `Object.hasOwn` instead of
trusting what a lookup returns. Tests with those four names, run through the
Stripe reader, history rebuild, live sync and plan breakdown, fail on the old
code and pass now.

## What is still not counted

These are unchanged and listed in the README: tiered (graduated or volume)
prices count as 0, and metered usage and fixed-amount coupons are left out.
The new coupon test pins the last one, so an amount-off coupon cannot quietly
become 1% off.
