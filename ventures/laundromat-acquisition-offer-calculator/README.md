# Laundromat Acquisition Offer Calculator

Free, browser-only calculator for people buying a laundromat. Enter the seller's
revenue and the real costs (utilities, rent, labor, repairs, a manager and a machine
replacement reserve) and your loan terms. It returns the **adjusted cash flow**, the
**walk-away price** (the lower of a cash-flow multiple and what the loan can carry at
your required debt coverage), and tests the prices you are weighing, including coverage
if revenue falls 10% or 20%.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/laundromat-acquisition-offer-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - cash flow, exact debt-limited price, per-offer coverage and stress.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-value-a-laundromat-before-you-make-an-offer.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not financial, tax,
legal or lending advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
