# Distillery Excise Tax Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/distillery-excise-tax-calculator/>

A free browser tool for craft distillers: **enter the bottles (50 mL to 1.75 L) and bulk proof gallons that leave the bonded
warehouse in a year, and see the federal spirits excise tax at the Craft Beverage Modernization Act rates, the tax built into each
bottle size and a 1.5 oz pour, and what growth past 100,000 proof gallons does to the bill.** Nothing is uploaded.

After using this, you can now **price a bottle knowing the federal tax inside it at its proof, and see the cost of crossing
100,000 proof gallons before you plan the expansion**, which used to be a proof-gallon tier calculation redone by hand each time.

## Use

1. Open `index.html`, enter proof and annual volumes, click Calculate the tax.
2. Pure logic is in `calc.mjs` (`plan()`, `exciseTax()`, `proofGallonsPerBottle()`); tests: `node --test`.

Modelled: $2.70/proof gal on the first 100,000 (domestic producers at 22.13 million or fewer, shared across a controlled group),
$13.34 up to 22.13 million, $13.50 above; proof gallon = wine gallons x proof / 100.
Not modelled: state and local spirits tax, importers and contract production, drawback, tax-free removals and losses, refunds,
the actual TTB return. Not tax advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
