# Lawn Aeration and Overseeding Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lawn-aeration-overseeding-bid-calculator/>

Free, browser-only calculator for lawn-care operators pricing core aeration and overseeding.
Enter the lot, the beds and hardscape, aerator swath, speed and passes, seed and starter
fertilizer rates and prices, crew and truck, the aerator's cost per hour, card fees and yearly
overhead. It shows **true profit per job, margin and profit per crew hour**, the **lowest quote
that earns your target margin**, the **price per 1,000 sq ft**, whether your minimum job fee is what
is being billed, break-even jobs a season, and compares two jobs side by side.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - turf, aerator hours, materials, job economics, minimum quote, comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-price-core-aeration-and-overseeding.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, insurance
or financial advice. Not affiliated with any lawn-care software vendor. **Privacy.** Everything
runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
