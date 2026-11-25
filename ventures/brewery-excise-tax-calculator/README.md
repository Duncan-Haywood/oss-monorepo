# Brewery Excise Tax Calculator

A free browser tool for craft brewers: **enter what leaves the brewery in a year (kegs, cases, growlers, barrels) and see the
federal beer excise tax at the Craft Beverage Modernization Act rates, the tax built into each keg, case and pint, and what
growth past the 60,000-barrel reduced rate does to the bill.** Nothing is uploaded.

**Live tool:** https://marisstella.app/brewery-excise-tax-calculator/

After using this, you can now **price a keg or case knowing the federal tax inside it, and see the cost of crossing 60,000
barrels before you plan the expansion**, which used to be a tier calculation redone by hand each time.

## Use

1. Open `index.html`, enter annual volumes, click Calculate the tax.
2. Pure logic is in `calc.mjs` (`plan()`, `exciseTax()`); tests: `node --test`.

Modelled: $3.50/bbl on the first 60,000 barrels (domestic brewers at 2 million barrels or fewer, shared across a controlled
group), $16/bbl up to 6 million barrels, $18/bbl above; 31-gallon barrel; quarterly/annual filing thresholds as a hint.
Not modelled: state and local beer tax, importers and contract-brewing assignments, tax-free removals and losses, refunds,
the actual TTB return. Not tax advice. No warranty; see the page footer. FSL-1.1-MIT licensed (`LICENSE`).

## Known gaps (quality census, 2026-11-15)

From [`portfolio/quality/audits/2026-11-15-brewery-excise-tax-calculator.json`](../../portfolio/quality/audits/2026-11-15-brewery-excise-tax-calculator.json); the growth-table eligibility, blank allotment and boundary tests are fixed. Still open: the filing hint checks only this year's liability (27 CFR 25.164 also requires the prior year under the limit); the 6 million barrel $16 tier is not shared across a controlled group; transfer in bond, beer returned to the brewery and foreign-producer assignment are not modelled; an allotment above 60,000 is clamped without a message.
