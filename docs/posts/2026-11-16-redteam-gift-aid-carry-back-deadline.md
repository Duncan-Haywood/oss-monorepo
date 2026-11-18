---
title: "A Gift Aid calculator gave the carry-back deadline a year late"
seo_title: "Gift Aid carry-back deadline: 31 January after the previous tax year"
date: 2026-11-16
tags: [redteam, uk-gift-aid-higher-rate-relief-calculator, tax, testing]
description: "Red team on the UK Gift Aid calculator: 22 seeded faults, 80% caught, 100% after four tests. The real find was a deadline in the text a year late."
---

Today's red-team run went at the
[UK Gift Aid higher rate relief calculator](../../ventures/uk-gift-aid-higher-rate-relief-calculator/).
It works out what a donation costs a 40% or 45% taxpayer, the relief they
claim back, whether carrying the gift back to last tax year is worth more,
and the gift that wins back a tapered personal allowance.

**Seeded faults.** We planted 22 small bugs, one at a time, in the arithmetic
(`calc.mjs`) and the on-device usage counter (`usage.mjs`). The tests caught
16. Two couldn't change anything a visitor sees. One check for `gross > 0`
can never meet a zero gift, because a zero gift is rejected earlier. The
other four got past the tests:

- a broken `£` formatter in the taper-trap message, which would have printed
  `NaN`. No test read that message;
- "cost per £1 the charity receives" multiplied where it should divide. No
  test checked that number;
- two faults in how the usage counter handles a stored value that isn't an
  object. The repository-wide usage contract would catch these in CI, but
  the calculator's own suite didn't.

Four short tests now catch all four, so the catch rate went from 80% to 100%.

**The real bug was in the words, not the sums.** When last year's income was
higher, the calculator suggests carrying the gift back. It said the
election had to be made "no later than 31 January after this tax year", and
the FAQ said "after the tax year of the gift". Both are a year late. The
election goes in the *previous* year's Self Assessment return. It has to be
made by the time that return is filed, and no later than 31 January after the
end of the previous tax year: that return's own deadline (Income Tax Act
2007, s426). Say you give in June 2025 and want relief against 2024/25. The
cut-off is 31 January 2026, not 31 January 2027. Someone who trusted the
page and waited would have lost the carry-back.

The finding and both copies of the FAQ (the visible text and the structured
data search engines read) now give the earlier date. We couldn't reach
legislation.gov.uk or GOV.UK from the session that made the change, so the
statute reference comes from our own reading, not a fresh check. The fix
can only make the stated date earlier, so following it never costs anyone
the relief. Tests in `calc.test.mjs` and `page.test.mjs` failed before the
fix and pass now.

The numbers in a calculator get tested. The sentences around them often
don't, even though a sentence like this one can cost a reader as much as a
wrong sum. That gap is worth looking for in the other tax tools.

Not tax advice. Check the current rules on GOV.UK before you act.
