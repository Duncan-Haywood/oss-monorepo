# Tire Shop Ticket Margin Calculator

Free, browser-only tool for independent tire shop owners and managers. List your
ticket lines (tires, alignment, road hazard coverage, sensor service, fees) with
price, parts cost, labor minutes and attach rate, plus technician cost, overhead
and bay hours. It shows net per sale and per average ticket after card fees,
parts and labor, break-even tickets for your overhead, bay utilization, what more
attach on each upsell is worth, and how many extra tickets a discount must win
back. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tire-shop-ticket-margin-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-line and per-ticket net, capacity, attach lift, discount break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model sales tax, disposal rules, financing,
warranty and returns, comebacks or inventory carrying cost. Unverified against a
real shop's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
