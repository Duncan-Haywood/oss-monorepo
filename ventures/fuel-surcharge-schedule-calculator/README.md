# Fuel Surcharge Schedule Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fuel-surcharge-schedule-calculator/>

A free browser tool for owner-operators, small carriers, dispatchers and freight brokers: **enter a trip, the published diesel price and one or
more fuel surcharge programs, and see the surcharge each pays, the extra fuel your truck actually burned above the peg, and the gap that comes
out of linehaul**. Nothing is uploaded.

After using this, you can now **see whether a broker's fuel surcharge really covers your fuel and what to ask for**, which used to be a peg, a step
and an mpg assumption in a rate confirmation that nobody divided out.

## Use

1. Open `index.html`, enter the trip and one program per line (`name, peg $/gal, mpg basis or % per step, step $/gal, loaded|all, cpm|pct`), click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`, `surchargeOf()`, `sensitivity()`); tests: `node --test`.

Modelled: price rounded down to the step above the peg, cents-per-mile (price over peg divided by the mpg basis) and percent-of-linehaul programs,
loaded or all miles, the fuel burned at your real mpg and pump price against fuel at the peg, the gap, the surcharge per loaded mile that would
break even, and a price sensitivity table. Not modelled: regional indexes, caps, minimums, index lag, per-contract mileage rules, taxes.
Not legal or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
