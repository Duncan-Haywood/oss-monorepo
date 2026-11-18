# Amusement Route Location Calculator

Free, browser-only calculator for coin-op route operators (arcade cabinets, pool tables,
claw machines, kiddie rides). Enter each location's weekly take per machine, commission,
visits and miles. It shows profit per route hour, the **weekly take each machine needs**,
and the **highest commission you can pay** and still earn the hourly you want, after
prizes, card fees, repairs, licences, machine wear and driving.

**Live tool:** https://marisstella.app/amusement-route-location-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - per-location economics, thresholds, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-commission-to-pay-a-location-for-arcade-machines.html` - guide whose worked example the tests recompute.

## Known gaps

From quality audit round 61
([`portfolio/quality/audits/2026-11-13-amusement-route-location-calculator.json`](../../portfolio/quality/audits/2026-11-13-amusement-route-location-calculator.json)):

- Commission is taken on the gross only. Many operators split after taking
  prize cost, licence fees, card fees or receipts tax off the top; that
  split basis is not modelled yet.
- Each location is charged its own round trip. Stops served on one chained
  drive are over-charged for miles and time; enter a share of the drive per
  stop as a workaround.
- A blank top-level field on the page becomes 0 rather than an error.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not business, tax or
financial advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
