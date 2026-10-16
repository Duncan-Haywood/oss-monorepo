# Crop Insurance Coverage Level Calculator (RP, RP-HPE, YP)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/crop-insurance-coverage-calculator/>

A free browser tool for row-crop farmers and the people who advise them. Type the APH yield,
projected price and the farmer-paid premium your agent quoted at each coverage level, plus a few
yield-and-price years you want to test. It returns what each level guarantees, the break-even
yield, what each extra 5 points costs per dollar of added guarantee, and the net result per acre
in each year and across them, under Revenue Protection, RP with Harvest Price Exclusion or Yield
Protection. Entirely client-side.

After using this, you can **see what the next 5 points of coverage actually buys** before you sit
down with your agent.

## Try it

Open [`index.html`](index.html) and click **Compare coverage levels**.

## The model

[`calc.mjs`](calc.mjs), pure functions. RP guarantee = APH x coverage x max(projected price,
harvest price), harvest price counted to 200% of projected; revenue to count = yield x harvest
price. RP-HPE guarantee uses the projected price only. YP pays missing bushels at the projected
price. Indemnity = max(0, guarantee - revenue to count). Net = indemnity - premium. Expected
values weight your own scenarios by your own chances.

## Limits

Defaults are placeholders, not a quote. County rates, subsidy, unit structure, trend-adjusted APH,
prevented planting, replant, SCO/ECO and the announced harvest price are not modelled. It does not
sell, quote or bind insurance. Talk to a licensed crop insurance agent.

## Tests

`node --test`
