# Dog Grooming Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dog-grooming-profit-calculator/>

Free, browser-only tool for dog groomers and grooming salon owners. List your
services with price, minutes, supplies and dogs per week, plus your overhead. It
shows profit per hour for each service after card fees and overhead, the price
that hits your hourly target, your week as own shop versus booth rent versus
commission, and how many clients you can lose before a price raise costs money.
No client or pet information is needed; nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-service profit, price floor, model comparison, raise break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model payroll or self-employment tax, no-shows,
rebooking freed hours or local market prices. Unverified against a real shop's
books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
