---
title: "Girth is not length plus girth: mutation testing a stamp duty and a parcel calculator"
seo_title: "Girth vs length plus girth, and a stamp duty figure in pence"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, uk-stamp-duty-calculator, parcel-dim-weight-calculator, javascript, ventures]
description: "Red team on two calculators changed this week: 7 of 20 seeded bugs caught, 13 gaps closed, and two wrong figures on public pages fixed."
---

Today's red-team run went after two money calculators that changed on `main`
this week: the [UK Stamp Duty calculator](https://marisstella.app/uk-stamp-duty-calculator/)
and the [parcel dimensional weight calculator](https://marisstella.app/parcel-dim-weight-calculator/).
Both have fast suites (under a second), so each got ten seeded bugs.

## Seeded bugs: 7 of 20 caught

| File | Seeded | Caught by the suite | Gaps closed |
|---|---|---|---|
| `uk-stamp-duty-calculator/calc.mjs` | 10 | 4 | 5 (one escape is unreachable: the minus-sign branch of a private formatter no caller reaches with a negative) |
| `parcel-dim-weight-calculator/calc.mjs` | 10 | 3 | 7 |

The escapes were the usual kind: boundaries tested on one side only. Nothing
checked that a 108 inch carton is still a parcel and a 109 inch one is not,
that length plus girth of exactly 165 ships while 166 does not, or that a
first-time buyer's saving appears from £300,001. Each now has a test, and
re-applying every escaped mutant shows all 12 non-equivalent ones caught.

## Two real defects

**A surcharge quoted in pence.** For a non-UK resident buyer, the stamp duty
page said "The 2% non-UK resident surcharge adds GBP 5,001.98 to the bill" on
a £250,099 purchase. That is 2% of the price. But Stamp Duty is rounded down
to whole pounds, and the bill shown a few lines above rose by £5,002. The
finding now quotes the difference between the resident and non-resident tax,
the number a buyer actually pays, and a test checks it across three buyer
types and five prices.

**Girth that was not girth.** The parcel calculator labelled
L + 2×(W + H) as "girth". Carriers define girth as the strap around the two
shorter sides, 2×width + 2×height, and write their 105, 130 and 165 inch
limits as *length plus girth*. The thresholds were applied to the right
number, so no flag was wrong, but a shipper who wrapped a tape round their
box and compared it with the page saw two different figures. The engine now
returns both `girth` and `lengthPlusGirth`, the flags say "length plus girth
134″ is over 130″", and the result card and both FAQ answers use the
carriers' terms.

Neither bug would have been caught by a test that only checked the tax or
the flag. Both are a number in a sentence that disagrees with the number the
code computed, which is worth a look on every calculator we ship.

*These calculators give estimates from the figures you type. They are not
tax, legal or shipping advice; check the rates with GOV.UK or your carrier
agreement.*
