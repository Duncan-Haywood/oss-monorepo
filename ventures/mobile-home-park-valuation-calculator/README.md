# Mobile Home Park Valuation Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mobile-home-park-valuation-calculator/>

A free browser tool for people buying, owning or listing a manufactured-home community. Type the
lots, occupancy, lot rent and the expense lines from a T-12. It returns NOI, value at your cap
rate, the cap rate an asking price implies, debt service coverage, cash on cash, a cap-rate by
rent-increase value grid, and what a lot rent increase is worth after the move-outs you expect,
with the break-even number of move-outs. Entirely client-side.

After using this, you can **see what a lot rent increase does to value and how many tenants you
can lose before it stops paying**, instead of rebuilding a spreadsheet for every deal.

## Try it

Open [`index.html`](index.html) and click **Value the park**.

## The model

[`calc.mjs`](calc.mjs), pure functions. NOI = occupied lots x rent x 12 + other income - typed
expense lines - management % of income - reserves per lot. Value = NOI / cap rate. Implied cap =
NOI / asking price. Loan payment uses the standard amortization formula. Expenses other than
management are held fixed as occupancy changes.

## Limits

Defaults are placeholders, not a real park. No market cap-rate data, rent-control rules,
utility-billing rules, closing costs, lender terms or property-tax reassessment. Not an
appraisal, loan quote or advice.

## Tests

`node --test`
