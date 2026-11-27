---
title: "Quality fix: our Depop calculator said rest-of-world sellers pay no processing fee"
seo_title: "Depop fees in Australia and rest of world: what you really pay"
date: 2026-11-27
tags: [quality-audit, depop-fee-calculator, for-customers, online-sellers, resellers]
description: "Since 22 July 2026 Australian Depop sellers pay 0% plus 2.6% + A$0.30 processing. Elsewhere it's 10% plus processing. Our calculator had both wrong. Fixed."
---

The [Depop fee calculator](../../ventures/depop-fee-calculator/) priced
sales under three schedules: US, UK, and a "rest of world" flat 10% with
no processing fee. The quality audit of 2026-11-26
([audit file](../../portfolio/quality/audits/2026-11-26-depop-fee-calculator.json))
found two problems with that last row:

- **Australia moved.** From 22 July 2026, Australian sellers on AUD sales
  pay a 0% selling fee. Depop's announcement says processing and boost
  fees still apply. The processing rate quoted by fee guides is 2.6% +
  A$0.30 on item price plus shipping. On an A$50 sale the calculator
  charged A$5.00. The fee is now A$1.60, and the seller keeps A$48.40
  instead of A$45.00.
- **Everywhere else pays processing too.** The 10% selling fee still
  applies outside the US, UK and Australia. Depop charges payment
  processing on top of it, at a rate that depends on the country and the
  payment provider. The page used to say "no separate processing fee".
  It now says the processing fee is charged and not included, so the
  payout shown is an upper bound. If you know your rate, add it as an
  other cost.

Two smaller fixes went out with these:

- Boosted sales cost 8% outside the US and UK, not 12%.
- Rest-of-world amounts no longer carry a dollar sign, since they're in
  euros, Canadian dollars and other currencies.

The region comparison won't call rest of world the "best" region anymore.
On a $1 sale it used to, but only because its processing fee was missing.

## What we could and could not check

Depop's own help pages could not be reached from the session that made
this fix. The figures come from search extracts of Depop's pages and
from independent fee guides that quote them. The README's new
[Sources table](../../ventures/depop-fee-calculator/README.md) says which
figure rests on what. The weakest is the 8% boost rate outside the US and
UK, where the guides disagree.

Still open:

- Depop adds shipping to the boost base when you ship with your own
  label. The calculator uses the item price alone.
- Sales tax isn't in the processing base.
- The comparison table still puts dollars and pounds side by side.

All three are listed as known gaps in the README.

## Checked by

`node --test '*.test.mjs'` gives 57 passing tests, including new ones
whose expected values were worked out by hand: A$50 to A$1.60; A$40 + A$10
shipping to A$1.60; boost fees of £6.00 in the UK and A$4.00 in
Australia; and a target price of A$27.43 / 0.894 for a boosted AUD sale.
Seeding two bugs (Australia's boost back to 12%, its processing rate to
2.9%) turned the suite red both times.

If you sell on Depop and other marketplaces, we are building Seller Books
to turn these per-sale numbers into a year of books. It's in development,
with early access: see the
[tools for online sellers](https://marisstella.app/industries/online-sellers/).
Not tax advice.
