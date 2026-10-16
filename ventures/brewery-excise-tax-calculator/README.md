# Brewery Excise Tax Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/brewery-excise-tax-calculator/>

A free browser tool for craft brewers: **enter what leaves the brewery in a year (kegs, cases, growlers, barrels) and see the
federal beer excise tax at the Craft Beverage Modernization Act rates, the tax built into each keg, case and pint, and what
growth past the 60,000-barrel reduced rate does to the bill.** Nothing is uploaded.

After using this, you can now **price a keg or case knowing the federal tax inside it, and see the cost of crossing 60,000
barrels before you plan the expansion**, which used to be a tier calculation redone by hand each time.

## Use

1. Open `index.html`, enter annual volumes, click Calculate the tax.
2. Pure logic is in `calc.mjs` (`plan()`, `exciseTax()`); tests: `node --test`.

Modelled: $3.50/bbl on the first 60,000 barrels (domestic brewers at 2 million barrels or fewer, shared across a controlled
group), $16/bbl up to 6 million barrels, $18/bbl above; 31-gallon barrel; quarterly/annual filing thresholds as a hint.
Not modelled: state and local beer tax, importers and contract-brewing assignments, tax-free removals and losses, refunds,
the actual TTB return. Not tax advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
