# Tax Deed Auction Max Bid Planner

Free, browser-only calculator for tax deed auction buyers. Enter the resale price and
what winning will really cost (buyer's premium, surviving liens, quiet title, occupant
removal, repairs, holding and the return on your cash) and it returns the **maximum
bid** that still hits your target profit, then stress-tests the bids you are weighing
against a 10% and 20% lower resale.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tax-deed-auction-max-bid-planner/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - closed-form max bid, per-bid profit and stress, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-set-a-max-bid-at-a-tax-deed-auction.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not legal, tax,
title or investment advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
