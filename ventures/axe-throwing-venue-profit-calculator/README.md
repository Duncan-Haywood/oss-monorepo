# Axe Throwing Venue Profit Calculator

Free, browser-only calculator for anyone planning or running an axe-throwing or throwing-sports
venue. Enter lanes, hours, fill, price per thrower, league nights, corporate events, drinks and
snacks, coaches, rent, insurance, the build cost and any loan. It shows **monthly profit and
margin**, **months to pay back the build**, the **fill needed to break even**, the **lowest
price per thrower for your target margin and for your payback target**, what 10% and 20% fewer
walk-in visits do, and compares a second scenario.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - venue economics, league lane time, loan, break-even, minimum prices, sensitivity, scenario comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-an-axe-throwing-venue-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, lending or
financial advice. Not affiliated with any league, franchise or equipment maker. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
