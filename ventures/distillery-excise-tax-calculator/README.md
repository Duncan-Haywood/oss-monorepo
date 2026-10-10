# Distillery Excise Tax Calculator

A free browser tool for craft distillers: **enter the bottles you remove from bonded premises in a year and see the federal
distilled spirits excise tax at the Craft Beverage Modernization Act rates, the tax built into each bottle size, and what
growth past the 100,000-proof-gallon reduced rate does to the bill.** Nothing is uploaded.

After using this, you can now **price a 750 mL bottle knowing the federal tax inside it, and see the cost of crossing 100,000
proof gallons before you plan the expansion**, which used to be a proof-gallon and tier calculation redone by hand each time.

## Use

1. Open `index.html`, enter annual bottle counts and ABV, click Calculate the tax.
2. Pure logic is in `calc.mjs` (`plan()`, `exciseTax()`); tests: `node --test`.

Modelled: $2.70 per proof gallon on the first 100,000 (domestic distillers at 22.23 million proof gallons or fewer, shared
across a controlled group), $13.34 up to 22.23 million, $13.50 above; proof gallon = wine gallon x ABV x 2 / 100.
Not modelled: state and local spirits tax, importers and contract-distilling rules, tax-free removals, losses, drawback,
the actual TTB return. Not tax advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
