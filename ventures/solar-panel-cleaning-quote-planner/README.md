# Solar Panel Cleaning Quote Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/solar-panel-cleaning-quote-planner/>

A free browser tool for solar panel cleaning businesses. Enter your hourly rate,
how many minutes a panel takes, your set-up time, travel and costs. It returns
a quote per job that hits your target margin, a price-per-panel curve showing
where your minimum call-out stops mattering, a day-by-day pack of a list of jobs,
an annual-plan estimate, and a payback check you can show the homeowner.
Entirely client-side; nothing is uploaded.

After using this, you can **quote any array at a price that earns your margin,
and show the customer why the clean pays for itself** instead of guessing a flat
rate or copying a competitor's.

## Try it

Open [`index.html`](index.html) and click **Price my jobs**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies. On-site time is
panels x minutes per panel x an access factor (ground 1.0, flat roof 1.15, single
storey 1.4, two storey 1.9) divided by crew size, plus set-up and travel. Cost is
crew labour over the whole time, an overhead share, vehicle cost per km and
consumables. Price is cost / (1 - margin), never below your minimum call-out.
Days are packed first-fit-decreasing. The customer payback compares the clean
price with the customer's own estimate of output lost to dirt, at their rate.

## What this does not cover

Roof safety and working-at-height rules, insurance, panel warranty terms, water
quality, weather, and tax. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
