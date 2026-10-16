# Coffee Roaster Margin Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/coffee-roaster-margin-calculator/>

Free, browser-only pricing tool for small and micro coffee roasters. Type the green
coffee price and your roast loss and it shows the true cost per roasted pound, what a
bag earns on each channel (retail, subscription, wholesale, market) including card
fees and postage, and profit per roasted pound and per roasting hour. A blend
optimizer finds the cheapest mix of your green coffees whose weighted cup score meets
a target, within per-coffee share limits and pounds available. A weekly plan turns the
bags you expect to sell into green pounds, batches, roasting hours and sacks to order,
and a break-even gives the monthly volume that covers your fixed costs. Exports a CSV.
Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - roast-loss cost, bag economics, price-for-margin, channel table,
  exhaustive blend search at 5% steps (cross-checked against a brute-force loop in the
  tests), cost-of-score frontier, weekly plan, break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-price-roasted-coffee.html` - guide with a worked 12 oz example that the test
  suite recomputes.

**No warranty.** Free and as-is; not legal or financial advice. Check every figure before
relying on it. Cup scores are numbers you supply, and a weighted average does not predict
taste; cup every blend before you sell it.

**Privacy.** Everything runs in your browser; prices and coffees are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
