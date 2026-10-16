# Cell Tower Lease Buyout Calculator

A free browser tool for landowners with a cell tower, rooftop or ground lease who have received an
unsolicited lump-sum offer for their future rent. Type the rent, escalator, expected added carriers,
yearly tenant-exit chance and the offer. It returns what the rent is worth at your own discount
rate, the annual return the buyer earns at the offered price, how much of the price rests on
carriers not yet signed, the offer that would match your rate, an after-tax comparison and a
discount-rate by exit-chance grid. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cell-tower-lease-buyout-calculator/

After using this, you can **see whether a tower lease buyout pays you what the rent is worth**,
instead of guessing from a multiple of one year's income.

## Try it

Open [`index.html`](index.html) and click **Evaluate the offer**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Yearly rent grows by the escalator; added-carrier rent
starts in the year you type; each year's expected cash flow is multiplied by (1 - exit chance)^year.
The offer buys years 1..N of that stream. Present value discounts at your rate; the buyer's return
is the IRR at which the stream equals the offer (bisection). Tax is a typed rate on offer minus
basis versus a typed rate on rent.

## Limits

Defaults are placeholders, not a real lease. Year-end payments, constant escalator and exit chance.
No lease-clause analysis (assignment, ROFR, termination), no buyout structure or tax-treatment
analysis, no market pricing data. Not legal, tax or financial advice.

## Tests

`node --test`
