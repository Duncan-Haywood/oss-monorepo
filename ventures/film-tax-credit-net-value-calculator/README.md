# Film Tax Credit Net Value Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/film-tax-credit-net-value-calculator/>

A free browser tool for film and TV producers, line producers and production accountants. Type your
incentive programme's terms (base rate, uplift, minimum, cap) and your budget, then the cents on the
dollar you can get for the credit, the fees, the wait and what a bridge loan costs. It returns the credit
granted, the net cash that reaches the budget, cents kept per credit dollar, its value in today's money,
what one more qualified dollar is worth, the qualified share at which the programme starts to pay, and
grids by sale price and by wait. Entirely client-side.

After using this, you can **compare a credit bid or a shoot-location decision on net cash**, instead of
on the headline rate.

## Try it

Open [`index.html`](index.html) and click **Work out the net credit**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Qualified spend is budget times a typed share; the credit is base
rate on it plus an uplift rate on a typed share of it, zero under the programme minimum and cut at the
cap. Cash is the credit times the sale price; fees are a share plus a fixed cost; bridge interest runs on
the advanced share for the wait; present value discounts at the producer's cost of capital. The marginal
dollar is measured by re-running the model, so it correctly reads zero at a cap and shows the jump at a
minimum.

## Limits

Defaults are placeholders, not any real programme. The tool embeds no state or country rule and does not
decide eligibility. One sale price and one payment date; no clawbacks, year caps, tax on the credit or
programme-funding risk. Not legal, tax or financial advice.
