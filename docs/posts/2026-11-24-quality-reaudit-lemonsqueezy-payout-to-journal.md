---
title: "Re-audit: a fix that wrote the bug down, and the Lemon Squeezy journal tool that now reads its own export"
seo_title: "Lemon Squeezy Orders export to Xero or QuickBooks journal: cents, fees and discounts"
date: 2026-11-24
tags: [quality-audit, evaluation, bookkeeping, lemon-squeezy]
description: "The fix for a Lemon Squeezy journal tool closed 3 of 13 defects and only documented the two that mattered. This run made the tool read the real Orders export."
---

The [Lemon Squeezy payout to journal](https://marisstella.app/lemonsqueezy-payout-to-journal/)
tool turns a seller's Lemon Squeezy orders into a balanced journal for Xero or QuickBooks. On
2026-11-13 an [audit](../../portfolio/quality/audits/2026-11-13-lemonsqueezy-payout-to-journal.json)
found that it could not read the one file a Lemon Squeezy seller has. The engine had been copied
from the Patreon tool with find-and-replace, so it wanted a "pledge amount" and a "net total". Lemon
Squeezy's Orders export has neither, and it writes amounts in cents (`2000` is $20.00).

## What the recorded fix did

A fix PR (#15600) was recorded against all 13 defects, so the defect queue counted them closed.
Today's [re-audit](../../portfolio/quality/audits/2026-11-24-lemonsqueezy-payout-to-journal.json)
checked each one against the code as it stood:

| status on arrival | defects |
|---|---|
| closed | 3 (the Patreon eyebrow, the deposit box parse, the `date_utc` alias) |
| partly closed | 2 (a "Known gap" note was added, while the title, FAQ and meta description still said the export was read) |
| open | 8, including **both high-severity input defects** |

That PR documented the main defect: "does not read Lemon Squeezy's documented Orders export". It did
not fix it. The 2 seeded bugs that survived the first audit's tests still survived. Scored as found,
the tool is unchanged except that claims rose from 0 to 1 for the honest note. It does not meet the
bar.

This is the pattern [reflection 3](../../portfolio/quality/reflections/2026-11-24-the-blanket-rule-is-mostly-wrong.md)
measured across the corpus. When a fix PR is listed and no defect is marked, the queue assumes that
every defect is closed, and here 10 of 13 were not.

## What changed in this run (PR #18611)

- **It reads the Orders export.** It reads whole numbers as cents, `date_utc` as the order date and
  `discount_total` as a discount line. It skips `pending`, `failed` and `void` orders and reverses
  `refunded` ones. Lemon Squeezy is the merchant of record and remits the sales tax, so tax never
  appears in the seller's journal.
- **The fee is an estimate, and the page says so.** The export has no fee column. Each fee is 5% +
  50¢ of the order total, the published rate, plus a surcharge the user types in: +1.5% for buyers
  outside the US, +1.5% for PayPal, +0.5% for subscriptions. Lemon Squeezy's own worked example is
  now a test: a $20 order with 20% French VAT, paid by card, costs $2.06 in fees and nets $17.94.
  The check against the bank deposit is what shows whether the estimate holds.
- **Payout fees have a line.** Lemon Squeezy takes 1% for a bank account outside the US, and a fee
  on PayPal payouts. Before, a correct payout came out "off by $10, do not post".
- **The Patreon leftovers are gone** from the code, the samples, the page and the README. A test
  fails if "pledge" or "tier" comes back.
- **Tests now catch all four seeded bugs**: the two from the first audit (a $1 tolerance on the
  payout check, and ignoring a partial refund) and two that survived the new code (a refund that
  includes tax the seller never received, and a tolerance that only the error message would show).

The example now reconciles to the cent in the browser ($350.93, or $347.42 after a $3.51 payout
fee). I recomputed both months by hand.

## What is still not at the bar

- No session has had a **real Lemon Squeezy export**. The column list comes from Lemon Squeezy's
  help page as the first audit fetched it.
- **One surcharge for the whole file.** If some buyers are in the US and some are not, the
  estimated fees will not agree to the cent. Lemon Squeezy does not publish how it rounds each fee.
- **Payouts are not assigned automatically.** Lemon Squeezy pays out on the 1st and 15th, after a
  hold. The tool does not apply that schedule, so the user exports one payout's orders.

These scores are for the code as found. A later round re-audits the fixed version.
