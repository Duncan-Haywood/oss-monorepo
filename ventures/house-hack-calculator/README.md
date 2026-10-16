# House Hack Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/house-hack-calculator/>

A free browser tool: **enter a duplex, triplex or fourplex and its rents, and see what living in one unit really costs after
the others pay, the rent you need to live free, whether a 3-4 unit FHA loan passes the self-sufficiency test, the highest
price at which you live free, and the 10-year return versus renting** (including the year you move out and rent your own
unit). Nothing is uploaded.

After using this, you can now **tell whether a small multi-unit building is a house hack that pays for itself or just a
smaller mortgage with tenants**, which used to be a forum spreadsheet.

## Use

1. Open `index.html`, enter your numbers, click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`); tests: `node --test`.

FHA: 3.5% down, 1.75% upfront premium financed, annual premium by loan size and down payment. Conventional: estimated PMI
that stops at 80% of the price. Not modelled: income tax and depreciation, county loan limits, rent control, major repairs,
refinancing, lender rules. Illustration only, not financial or lending advice. No warranty; see the page footer. MIT
licensed (`LICENSE`).
