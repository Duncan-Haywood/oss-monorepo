# Band Tour Profit Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/band-tour-profit-planner/>

Free, browser-only tour and gig budget for touring bands, solo acts and DJs.
List each show (miles, expected paid attendance, ticket price, venue deal, merch,
nights stayed) and your costs (van cost per mile, rooms, per diems, crew, agent
cut); it works out the venue fee under flat, door and versus deals, merch net,
profit per show and for the tour, the smallest attendance that breaks even, the
venue fee to ask for to hit a profit target, a half/75%/125% attendance
sensitivity, a keep / on-the-way / drop verdict per date, and each member's
share. Exports CSV and plain text. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - show and settings parsers, deal model, profit model, bisection
  for break-even attendance, ask calculator, an independent validator, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-budget-a-band-tour.html` - step-by-step guide.

**No warranty.** Free and as-is; planning arithmetic, not tax, legal or contract
advice. Check every figure against your contracts.

**Privacy.** Everything runs in your browser; shows and figures are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
