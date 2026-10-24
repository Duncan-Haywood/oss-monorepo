# Form 2290 HVUT Calculator

A free browser tool for owner-operators and small fleets: **list your trucks with taxable gross weight and first-use month, and see the
Form 2290 heavy highway vehicle use tax for each, prorated for the July–June period, the filing deadline, which trucks qualify for the
5,000-mile suspension, and what the next weight bracket costs.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/form-2290-hvut-calculator/

After using this, you can now **budget the Form 2290 bill for a truck before you buy it and know when it is due**, which used to be a
lookup in the IRS rate table plus month counting by hand.

## Use

1. Open `index.html`, one truck per line (`name, weight lb, first-use month, type, miles`), click Calculate the tax.
2. Pure logic is in `calc.mjs` (`plan()`, `annualTax()`); tests: `node --test`.

Modelled: IRC 4481 rates ($100 at 55,000 lb, +$22 per 1,000 lb, $550 above 75,000 lb), 75% for logging trucks, whole-month proration
from the month of first use, due date the last day of the following month, 5,000 / 7,500 (agricultural) mile suspension.
Not modelled: credits for sold or destroyed vehicles, exempt vehicle types, penalties and interest, the actual filing. Not tax advice.
No warranty; see the page footer. MIT licensed (`LICENSE`).
