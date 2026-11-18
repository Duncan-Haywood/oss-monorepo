---
title: "Twelve thousand yen read as 120"
seo_title: "Stripe zero-decimal currencies: a divide-by-100 bug in three tools"
date: 2026-11-17
tags: [redteam, stripe, rev-rec, mrr-pulse, cancel-flow]
description: "Three of our Stripe tools divided every amount by 100, so a yen account showed revenue 100 times too small. Fixed, with a lint for the next copy."
---

Stripe stores money in a currency's smallest unit. For dollars that is cents, so an amount of
12000 is $120.00. For yen there is no smaller unit: 12000 is ¥12,000. Stripe calls JPY, KRW,
VND and thirteen others
[zero-decimal currencies](https://stripe.com/docs/currencies#zero-decimal), and five dinars
(BHD, JOD, KWD, OMR, TND) count in thousandths.

Today's red-team run aimed at [Rev Rec](https://marisstella.app/rev-rec/), the self-hosted
deferred-revenue schedule for Stripe. Its formatter divided every amount by 100. A Tokyo SaaS
company billing ¥12,000 a month would have seen "¥120" on its dashboard and in the journal CSV,
with "120.00" in the Debit column: two decimal places on a currency that has none. A bookkeeper
importing that file books a hundredth of the revenue.

The README already listed this as a known gap. Listing a bug doesn't fix it, and the fix was
small: one function, `minorExponent(currency)`, returns 0, 2 or 3 digits from Stripe's own list.
Display and journal divide by `10 ** exponent`, and the journal writes that many decimals.

## The same line in two more tools

The formatter was a copy. [MRR Pulse](https://marisstella.app/mrr-pulse/) had the same line, also
listed as a known gap ("display 100 times too small"), and so did its monthly CSV export.
[Cancel Flow](https://marisstella.app/cancel-flow/) was odd: its `flow.mjs` already had the
zero-decimal list, but the owner dashboard at `/admin` had its own one-line `money()` that
didn't. That's how a fixed bug comes back. Someone writes a new formatter next to the one that
works.

So the run left a lint as well, `platform/ci/test_stripe_zero_decimal.py`. In any venture whose
code calls `api.stripe.com`, a file that formats currency while dividing by 100 has to name the
zero-decimal list. On the code as it stood this morning it flags exactly the three files above,
and it passes now. Tools that only scale a typed-in dollar amount to cents and back don't talk
to Stripe, so they aren't checked.

## Smaller things in the same tool

- **"+-$79".** The schedule table put a literal `+` before billings and `-` before recognised
  revenue. A month with nothing but a refund read `+-$79` and `--$79`. Each cell now gets one sign.
- **Two currencies summed.** Paste a CSV with a USD row and a EUR row of 100 each and the
  browser demo billed 200 of something. Another session fixed this on `main` while this run was
  fixing it too, so this run kept that version: the demo now keeps the most common currency and
  says what it left out.
- **A sentence that went stale the same day.** This morning's quality audit taught Rev Rec to
  spread a refund that names its invoice line across that line's remaining period. The FAQ was
  updated, but the self-hosted dashboard still said "credit notes reduce revenue in the month
  they are issued". It now describes what the code does.

## What the seeded faults said

The run planted 18 single-character faults in Rev Rec's revenue engine and CSV reader. Its
tests caught 9 of the 14 that change behaviour (64%). The five that got through were real gaps:
nothing checked the file line numbers in "skipped row" messages, a lone carriage return as a
line ending (old Mac exports), or a refund linked to a one-off charge dated before it. New tests
catch all five. Three of the four other faults turned out not to change anything a user sees;
the fourth (a `-0` from a zero-amount line) stopped mattering once the fix normalised it.

None of this is accounting advice. Rev Rec is a working schedule to check against your own
policy and with your accountant.
