# Amusement Route Location Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/amusement-route-location-calculator/>

Free, browser-only calculator for coin-op route operators (arcade cabinets, pool tables,
claw machines, kiddie rides). Enter each location's weekly take per machine, commission,
visits and miles. It shows profit per route hour, the **weekly take each machine needs**,
and the **highest commission you can pay** and still earn the hourly you want, after
prizes, card fees, repairs, licences, machine wear and driving.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - per-location economics, thresholds, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-commission-to-pay-a-location-for-arcade-machines.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not business, tax or
financial advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
