# Private Chef Service Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/private-chef-service-price-calculator/>

A free browser tool for private chefs and meal-prep businesses: **enter the guests, the hours and your costs, and get a cost-plus price per visit and per guest, what the price you quote today earns you per hour, and how the price moves with the size of the table**. Nothing is uploaded.

After using this, you can now **quote a small dinner at a price that covers the shopping, travel and cleanup that do not shrink with the table**, which used to take a per-person rate and a guess.

## Use

1. Open `index.html`, enter the table, hours, pay and costs, then click Price this visit.
2. Pure logic is in `calc.mjs` (`plan()`, `visitCost()`, `encodeShare()`); tests: `node --test`.

Modelled: prep time from guests, courses and minutes per guest per course, a dietary-needs prep multiplier, shopping, cooking, cleanup and travel hours, assistants for the on-site hours, groceries with a markup, mileage, per-visit equipment and insurance, profit as a share of the price, a minimum charge, a current-quote check with a monthly gap, a guest-count table, a share link. Not modelled: sales tax, tips, rented equipment beyond overhead, permit or cottage-food fees, cancellation terms, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
