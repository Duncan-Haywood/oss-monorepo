# Market Garden Bed Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/market-garden-bed-planner/>

Free, browser-only tool for small vegetable and flower farms. Enter one row per crop
(yield per bed-foot, price, days in bed, cost, labor, what you can sell) and your total
bed-feet, season length and labor hours. It solves the crop mix that earns the most as an
exact linear program, ranks crops by profit per bed-foot-day, prices one more bed-foot,
labor hour or unit of demand (the dual values from the same solution), compares the plan
with sorting by profit per bed-foot, and runs a seeded simulation of yield and price
swings. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, bounded simplex with dual prices, the sorted-plan comparison, simulation, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; a planning estimate from figures you supply, not advice.
It plans capacity, not a calendar, and does not model planting windows, rotation, weather
or losses. Unverified on a working farm: tested against hand-solved examples and an
exhaustive enumeration of the feasible corners.

MIT licence, see `LICENSE`.
