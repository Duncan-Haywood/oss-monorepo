# Candle Batch Cost Calculator

Free, browser-only tool for candle, wax-melt and soap makers. List your products
with retail and wholesale price, wax weight, other cost per unit and labor
minutes, plus wax and fragrance prices, waste, fees and channel mix. It shows
cost per unit, margin online, at fairs and wholesale, the retail and wholesale
price floors for your target margin, break-even units for your overhead, what an
hour of making earns, and what a wax price rise would cost. Nothing is uploaded.

**Live tool:** https://marisstella.app/candle-batch-cost-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, unit cost, channel margins, price floors, month result, wax shock, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model fixed per-order fees, a wholesale platform's
commission (enter the net you receive), sales tax, insurance, testing and labelling
rules, shipping, returns, breakage or unsold stock. Unverified against a real
maker's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.

**Known gaps** (quality round 98, [`audit`](../../portfolio/quality/audits/2026-11-22-candle-batch-cost-calculator.json)):
the built-in example enters jar size as wax weight (an 8 fl oz jar holds about 6.9 oz of soy wax); no fields yet for a
fixed per-order fee or a wholesale platform's commission (both disclosed on the page); no batch view (wax and fragrance
to melt for N units); a unit typed into a cell (`8 oz`) drops the row.
