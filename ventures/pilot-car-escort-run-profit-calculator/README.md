# Pilot Car Escort Run Profit Calculator

Free, browser-only calculator for pilot car, oversize-load escort and route survey operators.
Enter your quote (price per loaded mile, or a flat or day price), the minimum charge, loaded and
deadhead miles, driver hours, days away, fuel, meals, hotel, tolls, card fees, the vehicle's cost
and your yearly insurance, certification and equipment overhead. It shows **true profit per run,
margin and profit per driver hour**, the **lowest quote that earns your target margin**,
break-even runs a year, and compares two runs side by side (a short run that bills the minimum
against a long run).

**Live tool:** https://marisstella.app/pilot-car-escort-run-profit-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - run economics, minimum charge, lowest quote, break-even, comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-a-pilot-car-escort-run-really-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, insurance
or financial advice. Not affiliated with any permit service, carrier or state agency.
**Privacy.** Everything runs in your browser; nothing is uploaded.

FSL-1.1-MIT licence, see `LICENSE`.

## Known gaps

From quality audit round 114 ([`2026-11-26-pilot-car-escort-run-profit-calculator.json`](../../portfolio/quality/audits/2026-11-26-pilot-car-escort-run-profit-calculator.json)):

- Vehicle depreciation and yearly overhead are charged per run, whatever the miles or days, which flatters long runs in the two-run comparison.
- Revenue is a per-loaded-mile or flat price with one minimum. Operators also bill deadhead, height-pole premiums, layover, wait time, no-go fees and per-day rates on multi-day moves; none are modelled.
- The copied summary's cost lines leave out card fees, vehicle cost and overhead share, so they do not sum to the total.
