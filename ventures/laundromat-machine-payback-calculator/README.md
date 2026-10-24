# Laundromat Machine Payback Calculator

Free, browser-only tool for laundromat owners and people thinking of buying or
re-equipping one. List your machine lines with count, price per cycle, turns per
day, utility cost per cycle and installed cost, plus overhead. It shows payback
months and monthly contribution for each line, the turns per day each line needs
to hit your target payback, store net after overhead, and how many cycles you can
lose before a price rise costs money. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/laundromat-machine-payback-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-line contribution and payback, store net, raise break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model financing, taxes, depreciation, repairs,
labor or local market prices. Unverified against a real store's books: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
