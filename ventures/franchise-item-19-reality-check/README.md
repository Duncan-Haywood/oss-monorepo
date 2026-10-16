# Franchise Item 19 Reality Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/franchise-item-19-reality-check/>

Free, browser-only reader for the earnings claim in a franchise disclosure
document (Item 19). Type the tiers (label, units, average revenue). It reports:

- **Average versus median**, and the share of reporting units below the average.
- **Coverage**: how much of the system the figures describe, and the system-wide
  figure implied if the missing units earn a share you choose.
- **Per-tier owner earnings** after royalty, ad fund, cost of goods, scaling labor
  and fixed costs, with cash-on-cash and payback on your investment.
- **Sales you would need** to break even, to pay yourself, and to pay back in five years.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - tier parsing, owner earnings, coverage adjustment, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-read-franchise-item-19-earnings-claims.html` - guide with a worked example the test suite recomputes.

**No warranty.** Free and as-is; not financial, legal or investment advice. Results
are arithmetic on the numbers you type. Verify every figure with the disclosure
document, an independent franchise attorney and an accountant.

**Privacy.** Everything runs in your browser; nothing is uploaded. Anonymous feature
counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
