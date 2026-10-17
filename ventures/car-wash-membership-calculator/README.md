# Car Wash Membership Calculator

Free, browser-only tool for car wash owners and managers weighing an unlimited
wash plan. Enter plan price, single-wash price, cost per wash, how often each
kind of member washes, churn, signup cost and tunnel hours. It shows net per
member after payment fees and wash cost, the washes a month at which a member
stops paying for themselves, the share of members past that point, the retail
washes the plan cannibalizes, member lifetime value, capacity use, and a price
sensitivity table. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/car-wash-membership-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - segment parsing, per-member and store math, cannibalization, lifetime value, capacity, price table, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model sales tax, how many members a price change
wins or loses, seasonality, plan tiers, fleet plans or failed-payment churn.
Unverified against a real wash's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
