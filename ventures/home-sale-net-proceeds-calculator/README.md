# Home Sale Net Proceeds Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/home-sale-net-proceeds-calculator/>

Free, browser-only seller net sheet. It shows the cash you receive at closing, estimates
the capital gains tax on the sale, finds the list price that nets a target, and compares
offers that differ in price and seller concessions.

- cash at closing from commissions, title, transfer tax, concessions, payoff and prorations;
- home sale exclusion (full, partial or none), depreciation recapture, long-term brackets,
  net investment income tax and a flat state rate, tax year 2026;
- "what do I have to list at to net $X" solved at closing or after tax;
- price sensitivity grid, and what 0.5 point of commission or $10,000 of price is worth;
- up to three offers ranked by net after tax;
- copy as text, CSV, and save/load as JSON.

Open `index.html` over any static server (it is an ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - net sheet, tax estimate, inverse price solver.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-calculate-net-proceeds-from-selling-a-house.html` - guide whose worked example
  the test suite recomputes.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal or
real estate advice. Federal figures are tax year 2026; state rules are a flat rate you
enter. The closing disclosure controls what is owed. Property tests run hundreds of random
homes and assert the price solver inverts the net calculation.

**Privacy.** Everything runs in your browser; nothing is uploaded. Anonymous feature
counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
