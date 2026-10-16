# Pickleball Facility Pro Forma

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pickleball-facility-pro-forma/>

Free, browser-only pro-forma for anyone opening or running an indoor pickleball
(or padel) facility. Enter courts, build-out cost, hours open, hourly rates and
utilization by daypart, memberships, league/lesson/event revenue, pro-shop and
F&B margin, staff, rent, utilities, insurance, processing fees, debt service and
ramp-up months. It shows the monthly P&L at steady state, revenue per
court-hour, break-even utilization and break-even members, a 24-month ramp cash
curve (months to cash break-even, peak drawdown), payback on the build-out,
sensitivity tables, and a ranking of what raises profit most. Nothing is
uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - capacity and revenue model, ramp cash curve, break-evens, sensitivities, lever ranking, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal, tax
or financial advice and no substitute for a qualified accountant, lender or
attorney. Not affiliated with any pickleball brand. It models no market data,
taxes, seasonality, churn or price response. Unverified against a real
facility: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
