# Car Lease Deal Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/car-lease-deal-checker/>

Free, browser-only checker for a car lease quote. It shows the interest rate inside
the quote, finds the money factor hiding in a quoted payment when the dealer will not
say, prices any markup over the base rate in dollars, and compares leasing with buying
the same car.

- money factor to APR, plus an effective APR that counts fees;
- "I only know the payment" mode, solved with the lease formula run backwards;
- markup over the manufacturer's base rate per month and over the term;
- lease vs buy over the same months, with expected resale value;
- what each $1,000 off the price, 0.0001 off the factor or point of residual is worth;
- copy as text, CSV, and save/load as JSON.

Open `index.html` over any static server (it is an ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - lease formula, its inverse, effective APR by bisection, loan comparison.
- `usage.mjs` - local-only feature counters with an opt-out.
- `what-is-a-money-factor.html` - guide whose worked example the test suite recomputes.

**No warranty.** Free and as-is; arithmetic on the numbers you type using the standard
lease formula, not financial, legal or tax advice. Taxes and fees vary by state; the
lease contract controls what is owed. The property tests run hundreds of random leases
and assert the payment formula and its inverse agree.

**Privacy.** Everything runs in your browser; nothing is uploaded. Anonymous feature
counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
