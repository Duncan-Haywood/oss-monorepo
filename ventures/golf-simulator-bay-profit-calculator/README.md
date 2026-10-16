# Golf Simulator Bay Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/golf-simulator-bay-profit-calculator/>

Free, browser-only calculator for anyone planning or running an indoor golf simulator lounge (or
another bay-rental venue). Enter bays, open hours, peak and off-peak rates and utilization, members,
food and drink, league nights, staff, rent, software per bay, card fees, the build cost and any loan. It shows **monthly profit and
margin**, **months to pay back the build**, the **utilization needed to break even**, the **lowest
peak and off-peak rates for your target margin**, the **lowest peak rate for a payback target**, profit per bay, what 10% and 20% fewer bookings do, and compares a second scenario (say five bays
instead of three).

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - room economics, loan, break-even, minimum rates, payback-target peak rate, sensitivity, scenario comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-a-golf-simulator-lounge-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, lending or
financial advice. Not affiliated with any simulator maker or software vendor. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
