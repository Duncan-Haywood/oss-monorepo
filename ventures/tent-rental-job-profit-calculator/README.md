# Tent Rental Job Profit Calculator

Free, browser-only calculator for tent, party and event rental companies. Enter the rental
price, delivery fee, crew size and hours, truck miles, supplies, damage reserve, card fees, the
tent's cost and expected rentals, and your yearly storage/insurance/truck overhead. It shows
**true profit per job, margin and profit per crew hour**, the **lowest quote that earns your
target margin**, how many rentals a tent needs to **pay for itself**, break-even jobs a year, and
compares two jobs side by side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tent-rental-job-profit-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - job economics, minimum quote, payback, job comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-a-tent-rental-job-really-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, insurance
or financial advice. Not affiliated with any rental software vendor. **Privacy.** Everything
runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
