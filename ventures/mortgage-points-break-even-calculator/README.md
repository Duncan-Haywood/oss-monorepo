# Mortgage Points Break-Even Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mortgage-points-break-even-calculator/>

A free browser tool for anyone choosing between a mortgage rate with discount points and one without.
Type the loan, term, the rate with no points, the lower rate with points and their cost, how many years
you expect to keep the loan, the return on cash you would otherwise keep, your tax rate on mortgage
interest and the yearly chance you sell or refinance. It returns the simple and true break-even month,
the yearly return on the points cash, the dollars ahead or behind at your horizon, the chance you finish
ahead given you may sell or refinance early, and a horizon by cash-return grid. Entirely client-side.

After using this, you can **see whether the points pay for themselves before the loan is likely to
end**, instead of trusting a single break-even number.

## Try it

Open [`index.html`](index.html) and click **Compare the two loans**.

## The model

[`calc.mjs`](calc.mjs), pure functions, monthly amortization of two loans of the same size and term.
Advantage at month t is the future value of the after-tax payment savings, minus the points compounded at
the return on cash, plus the difference in remaining balances. A yearly chance of moving becomes a monthly
hazard that weights each possible end month. The implied return solves for the monthly rate at which the
savings and the balance gap repay the points (bisection).

## Limits

Defaults are placeholders, not a real offer. Fixed-rate loans, points paid in cash, constant return on
cash and constant chance of moving; points are not modelled as deductible. Not lending, tax or financial
advice.
