# E-Bike Rental Fleet Profit Calculator

Free, browser-only calculator for a bike shop, hotel, campground or tour desk running or adding an
e-bike rental counter. Enter bikes, busy and quiet days and how full the fleet gets, half-day and
full-day prices, add-ons, staff, rent, batteries, replacement and any loan. It shows **season profit
and margin**, **payback**, the **utilization needed to break even** and to hit a payback target, the
**lowest half-day and full-day prices** for break-even, a target margin and a payback target, profit
per bike, what 10% and 20% fewer bookings do, and compares a second scenario (say thirty bikes
instead of twenty at the lower utilization you expect).

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ebike-rental-fleet-profit-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - slot economics, fleet replacement reserve, loan, exact break-even and minimum prices, sensitivity, scenario comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-an-ebike-rental-business-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, lending or
financial advice. Does not model claims, permits or taxes. Not affiliated with any e-bike maker or
rental software. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
