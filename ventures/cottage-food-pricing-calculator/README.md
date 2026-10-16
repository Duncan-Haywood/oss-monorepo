# Cottage Food Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cottage-food-pricing-calculator/>

Free, browser-only tool for home bakers and small food makers. Paste one row per
product (ingredients per batch, units, minutes, packaging, current price). It
computes the full cost per sellable unit including your time, overhead and unsold
goods, the price to charge online, at a farmers market and wholesale, and what you
really earn per hour at your current price. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, full cost, margin-based prices by channel, hourly earnings, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal, tax,
licensing or food-safety advice. It does not model cottage-food rules, permits,
labels, sales caps or demand. Unverified against a real kitchen's books: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
