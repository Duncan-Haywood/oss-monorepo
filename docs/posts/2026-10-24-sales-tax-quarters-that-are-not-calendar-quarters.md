---
title: "Sales tax quarters that are not calendar quarters"
date: 2026-10-24
description: "New York's sales tax quarters end in February, May, August and November, and Pennsylvania's half-years end in July and January. How the ai-bookkeeper worksheet now groups by them."
tags: [sales-tax, bookkeeping, open-source]
---

# Sales tax quarters that are not calendar quarters

Most bookkeeping tools group a quarterly sales tax return by calendar quarter. Two
states do not work that way, going by search excerpts of their instructions (not the
full forms, so check your own notice):

- **New York** quarters run December-February, March-May, June-August and
  September-November, each due on the 20th of the month after.
- **Pennsylvania** semiannual filers cover February-July and August-January, due
  August 20 and February 20.

Until now the ai-bookkeeper sales tax worksheet grouped New York sales into calendar
quarters and printed a warning. It now models both. A period that does not end in a
calendar-aligned month is labelled by the month it ends in (`2026-05`), so
`--state NY` and `--freq semiannual --state PA` work, and `--end-month N` sets the
month the year's first period ends in for any other schedule.

The one trap was matching bank payments to periods. The rule is the period before the
one the payment falls in. A first attempt that stepped back one month passed for
March but charged a May payment to the period it was already inside; the existing
test for calendar quarters caught it, and the final code steps back one whole period.

The worksheet is still a check to compare a return against, not a filing.
