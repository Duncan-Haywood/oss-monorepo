---
title: "Clearing a box on the gig driver tax page showed an error, and the page didn't mention QBI"
seo_title: "Gig driver mileage vs actual expenses calculator: red-team fixes"
date: 2026-11-10
tags: [gig-driver-net-pay-calculator, redteam, testing, tax]
description: "We seeded 16 faults into the standard-mileage-or-actual-expenses page. Tests caught 10. The six gaps are now covered, and two real defects are fixed."
---

The [standard mileage or actual expenses page](https://marisstella.app/gig-driver-net-pay-calculator/tax.html)
compares the two ways a delivery or rideshare driver can deduct a car, and
shows what each one does to self-employment tax, income tax and the quarterly
payment. Today's red-team run aimed at its arithmetic in `tax.mjs`.

**Seeded faults.** `prompts/redteam.py` put in 16 single-line mutants, one at a
time, and ran the page's tests after each one. The tests caught 10 (62.5%).
Five of the six that got through changed a figure a driver would see: the
"keep" amount after tax could have been profit *plus* tax, the per-mile
break-even could have been multiplied where it should be divided, a
non-numeric entry could have turned into `NaN` with no error, and the Medicare
part under the $400 Schedule SE floor could have read $1. The sixth, a default of
$1 of W-2 wages in place of $0, takes 12 cents off Social Security tax for
anyone whose profit reaches the 2026 wage base of $184,500. Each now has a test
that fails with the mutant in and passes without it, and a rerun caught all
six (100%).

**Two real defects.**

1. The page sends the empty string for a box the driver clears. The optional
   boxes (parking and tolls, phone and supplies, W-2 wages, the mileage rate,
   the wage base and the income-tax rate) had defaults for a *missing* value
   but not for a blank one, so clearing "Parking and tolls" replaced the
   answer with "Parking and tolls must be a number". A cleared optional box now
   means its default. A new test clears every box on the page in turn and
   expects a named error or finite figures, never `NaN`.
2. Income tax is the driver's marginal rate times profit (less half the
   self-employment tax). That leaves out the 20% qualified business income
   (QBI) deduction most drivers can take, so the income-tax part runs high.
   The page listed what it leaves out but not that. It now says so, and a page
   test checks the sentence stays.

Neither fix changes the page's worked example ($5,379 under the standard rate,
$7,517 under actual expenses, on a $40,000 year), which a test checks against
the code. The page is still arithmetic on typed figures, not tax advice.
