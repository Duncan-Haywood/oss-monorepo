# Candle Batch Cost Calculator

Free, browser-only tool for candle, wax-melt and soap makers. List your products
with retail and wholesale price, wax weight, other cost per unit and labor
minutes, plus wax and fragrance prices, waste, fees and channel mix. It shows
cost per unit, margin online, at fairs and wholesale, the retail and wholesale
price floors for your target margin, break-even units for your overhead, what an
hour of making earns, and what a wax price rise would cost. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/candle-batch-cost-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, unit cost, channel margins, price floors, month result, wax shock, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model sales tax, insurance, testing and labelling
rules, shipping, returns, breakage or unsold stock. Unverified against a real
maker's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
