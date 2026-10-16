# Shipping Box Size Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shipping-box-size-optimizer/>

Free, browser-only tool for online sellers who pack their own orders. List your
products (packed size, weight, orders per month) and the cartons you could buy.
It solves which 1 to 10 box sizes to stock so every order ships in its cheapest
fitting box, counting dimensional weight, the box itself and void fill, and
shows what each extra size saves a month, which box each product goes in, and
how far today's boxes are from the best set. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, fit check, billable weight and landed cost, custom size
  candidates, and the solver: exact enumeration of every K-size set when that
  is small enough, otherwise greedy plus multi-start one-swap (Teitz-Bart)
  local search on the p-median objective.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-many-box-sizes-to-stock.html` - guide with a worked example that the
  test suite recomputes.

**No warranty.** Free and as-is; arithmetic and optimization on figures you
type, not legal, tax, financial or shipping advice. It does not pack several
products into one box, price carrier surcharges or zones, or model box minimum
order quantities. Unverified against a real warehouse's invoices: tested on
hand-calculated examples and against exhaustive search.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
