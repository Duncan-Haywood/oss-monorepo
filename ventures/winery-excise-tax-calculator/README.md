# Winery Excise Tax Calculator

A free browser tool for wineries and cideries: **enter the cases, bottles and bulk gallons that leave your bonded premises in a year,
and see the federal excise tax before and after the Craft Beverage Modernization Act credit, the tax built into each bottle, and
what growth past 30,000 and 130,000 wine gallons does to the bill.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/winery-excise-tax-calculator/

After using this, you can now **price a bottle knowing the federal tax inside it and see the cost of crossing the credit tiers
before you plan the expansion**, which used to be a tier calculation redone by hand each time.

## Use

1. Open `index.html`, enter volumes by category, click Calculate the tax.
2. Pure logic is in `calc.mjs` (`plan()`, `exciseTax()`); tests: `node --test`.

Modelled: IRC 5041(b) rates per wine gallon ($1.07 still up to 16% ABV, $1.57, $3.15, $3.40 sparkling, $3.30 carbonated, $0.226
hard cider); 5041(c) credit of $1.00 / $0.90 / $0.535 per wine gallon (cider 6.2 / 5.6 / 3.3 cents) over the first 30,000 /
next 100,000 / next 620,000 gallons, capped at the tax; a percentage share of the tiers for controlled groups.
Not modelled: state and local tax, wine over 24% ABV, importers, drawback, tax-free removals and losses, refunds, the actual TTB
return. Not tax advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
