# Scrap Metal Yard Payout Calculator

Free, browser-only calculator for scrappers, electricians, plumbers, HVAC techs and demolition
crews. Enter the lots you are hauling and what two yards pay for each. It shows what the load
**nets at each yard after fuel, time, fees and grading deductions**, whether **splitting the
load** earns more than a second trip costs, the **percentage the other yard must pay to catch
up**, a 10% and 20% price-drop check, and whether **stripping copper wire beats selling it
insulated** (with the break-even recovery).

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/scrap-metal-yard-payout-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - unit conversion, per-yard netting, split, catch-up factor, price sensitivity, wire strip analysis, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `is-a-farther-scrap-yard-worth-the-drive.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal or financial
advice. No price feed: type your yards' own board prices. Not affiliated with any yard.
**Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
