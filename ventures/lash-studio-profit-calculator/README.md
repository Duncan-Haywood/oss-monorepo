# Lash Studio Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lash-studio-profit-calculator/>

Free, browser-only calculator for lash technicians and studio owners. Enter a price
list, supplies, card fees, no-show rate, studio overhead and the hourly you want to take
home. It shows profit per chair hour for every full set and fill, the **price that hits
your target**, what a schedule earns in a month, and what a client is worth over a
lifetime of fills (with the lowest new-client promotion that is still safe).

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - per-service economics, overhead, client lifetime, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-to-charge-for-lash-extensions.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not business, tax or
financial advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
