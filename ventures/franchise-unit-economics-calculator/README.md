# Franchise Unit Economics Calculator

A free browser tool for people deciding whether to buy a franchise unit. Enter the
franchise fee, build-out, equipment and cash cushion, the loan, the sales ramp,
running costs and what the franchisor takes (royalty, minimum royalty, ad fund,
fixed fees). It shows cash month by month, the payback month, the multiple on your
cash and annual return, the break-even sales, whether the cash cushion survives the
ramp-up, loan cover, a sales-by-cost sensitivity grid, and how much the brand has to
lift your sales to beat opening the same business independently. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/franchise-unit-economics-calculator/

After using this, you can **tell whether a franchise unit pays, how much cash it needs
before it does, and what sales lift the brand must deliver to be worth its fees**.

## Try it

Open [`index.html`](index.html) and click **Work out the unit economics**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Month 0 is the equity you put
in (total investment less the loan). Each month: sales (ramping from a starting share to
maturity, then growing yearly) less variable costs, royalty (the larger of the percentage
and the minimum), ad fund, fixed fees and fixed costs (escalating yearly), less the loan
payment. Break-even and target sales are exact, not searched for. The independent
comparison sets a steady year with no fee, royalty, ad fund or tech fee and a smaller
sales base against a franchise year with the fee spread over the years you keep the unit,
and solves for the sales share at which they tie.

## Limits

Defaults are placeholders. Income tax, depreciation, financing fees, renewal and transfer
terms, territory rules and required remodels are not modelled. It does not review a
franchise agreement or predict sales.

## Tests

`node --test`
