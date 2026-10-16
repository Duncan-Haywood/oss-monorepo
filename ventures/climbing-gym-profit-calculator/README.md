# Climbing Gym Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/climbing-gym-profit-calculator/>

Free, browser-only calculator for anyone planning or running a climbing or bouldering gym. Enter
day passes, members and the membership fee, youth programs, parties, front desk staff, route
setting, rent, insurance, the build cost and any loan. It shows **monthly profit and margin**,
**months to pay back the build**, the **members needed to break even**, the **lowest day pass and
membership fee for your target margin**, the day pass that reaches your payback target, a crowding
check against comfortable capacity, what 10% and 20% less demand does, and compares a second scenario.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - gym economics, loan, break-even, minimum prices, sensitivity, scenario comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-a-climbing-gym-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, lending or
financial advice. Not affiliated with any gym chain, franchise or wall builder. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
