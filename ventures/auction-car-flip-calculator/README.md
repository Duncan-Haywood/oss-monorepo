# Auction Car Flip Calculator

Free, browser-only tool for people who buy cars at auction to repair and resell.
Enter the expected resale price, repairs, the auction's buyer fee tiers,
transport, tax, holding and financing costs and the profit you require. It solves
for the max bid and the break-even bid, shows profit at a ladder of bids, and
stress-tests the max bid against repair overruns and a lower resale price.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/auction-car-flip-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - repair and fee-tier parsing, all-in cost, max-bid solver, stress grid, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice and not an appraisal. It carries no auction's fee schedule, no
tax rate and no market value. Unverified against real auction results: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
