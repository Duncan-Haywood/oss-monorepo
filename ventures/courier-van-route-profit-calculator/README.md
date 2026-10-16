# Courier Van Route Profit Calculator

Free, browser-only calculator for independent last-mile delivery contractors who own or
lease their van. Enter route pay (flat, per stop, per package or a mix), stops, packages,
hours, miles, fuel, van payment, insurance, maintenance, depreciation, tolls, a claims
reserve and a tax set-aside. It shows **true profit per route, per hour and per stop**, cost
per mile, break-even stops, the **lowest route pay that hits your hourly target** after the
set-aside, weekly and annual take-home, and compares two route offers side by side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/courier-van-route-profit-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - route economics, minimum pay, offer comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-profit-per-route-for-delivery-van-contractors.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal or
financial advice. Not affiliated with any delivery platform. **Privacy.** Everything runs in
your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
