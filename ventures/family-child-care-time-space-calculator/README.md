# Family Child Care Time-Space Calculator

Free, browser-only tool for family child care and home day care providers. List
the rooms you use, the hours you are in business and your annual home expenses.
It computes the time-space percentage described in IRS Publication 587, the
business share of each expense, a comparison with the simplified method, and what
one more weekly hour is worth. No child or family information is needed; nothing
is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/family-child-care-time-space-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, time and space shares, regular and simplified methods, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or legal
advice. It does not model depreciation, recapture, Schedule A effects, income
limits or state rules. Unverified against a filed return: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
