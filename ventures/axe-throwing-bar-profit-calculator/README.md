# Axe Throwing Bar Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/axe-throwing-bar-profit-calculator/>

Free, browser-only calculator for anyone planning or running an axe throwing bar or family
entertainment center. Enter thrower capacity, sessions, fill, ticket price, private events,
league players, food and drinks, coaches and bar staff, rent, insurance, the build cost and any loan. It shows **monthly
profit and margin**, **months to pay back the build**, the **fill needed to break even**, the
**lowest ticket for your target margin and for your payback target**, what 10% and 20% fewer
visits do, and compares a second scenario.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - bar economics, loan, break-even, minimum tickets, sensitivity, scenario comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-an-axe-throwing-bar-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, lending or
financial advice. Not affiliated with any bar chain, franchise or equipment maker. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
