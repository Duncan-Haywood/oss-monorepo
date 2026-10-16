# Fleet EV vs Diesel TCO Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fleet-ev-vs-diesel-tco-calculator/>

A free browser tool for owners of small fleets (vans, box trucks, service trucks)
weighing electric against gas or diesel. Enter vehicle and charger cost, fuel
and electricity prices, demand charges, maintenance, insurance and resale; it
shows cost year by year, the present-value saving, the payback year, the fuel
price, electricity rate and mileage at which the two tie, a price sensitivity
grid, and whether the EVs can do your hardest day and charge overnight.
Entirely client-side.

After using this, you can **tell how far your fleet is from the point where
electric pays, and which number it hinges on**.

## Try it

Open [`index.html`](index.html) and click **Compare the costs**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Year 0 is purchase
(less confirmed incentives) and charger install. Each year adds fuel or energy,
demand charges, maintenance, charger upkeep and the insurance difference, with
separate escalation rates for fuel, electricity and other costs. Resale is
received in the last year and everything is discounted at your rate. Because every
cost is affine in fuel price, depot electricity rate and annual miles, the
break-evens are exact, not searched for.

## Limits

Defaults are placeholders. Incentives default to zero and are never assumed.
Tax depreciation, financing, utility tariff structure beyond a flat demand
charge, and battery replacement are not modelled.

## Tests

`node --test`
