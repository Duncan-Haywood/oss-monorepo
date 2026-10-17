# Mineral Rights Offer Calculator

A free browser tool for oil and gas mineral and royalty owners who have received an unsolicited
lump-sum offer for their future checks. Type the current monthly check, how fast it is declining, any
planned wells and the offer. It returns what the remaining checks are worth at your own discount rate,
the annual return the buyer earns at the offered price, the offer as a multiple of monthly income, how
much of the price rests on wells not yet drilled, an after-tax comparison, and discount-rate by decline
and price sensitivity grids. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/oil-gas-mineral-rights-offer-calculator/

After using this, you can **see whether a royalty buyout pays you what the checks are worth**, instead
of judging it from a "x months of income" multiple.

## Try it

Open [`index.html`](index.html) and click **Evaluate the offer**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Existing wells follow an Arps decline from the current check:
hyperbolic with your b-factor, switching to exponential once the instantaneous decline reaches your
terminal rate. Planned wells add a second stream from a start month, weighted by the chance they are
drilled. A price change scales every month, and wells shut in below a minimum check. Present value
discounts monthly at your annual rate; the buyer's return is the IRR at which the sold stream equals the
offer (bisection). Tax is a typed rate on offer minus basis versus a typed rate on income.

## Limits

Defaults are placeholders, not a real royalty. A smooth decline curve and one price change, no
deductions or downtime, no depletion or basis step-up, no conveyance or title analysis, no market
pricing data. Not legal, tax or financial advice.

## Tests

`node --test`
