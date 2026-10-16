# Pastured Poultry Profit Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pastured-poultry-profit-planner/>

A free browser tool for people raising, or thinking of raising, pasture-raised
meat chickens. Enter batch size, losses, feed, processing and prices. It shows
profit per batch, per bird and per hour of your own labour, the dressed price per
pound you need to break even, and how the season moves with mortality, feed
price, sales channel and flock size. Entirely client-side.

After using this, you can **see whether a batch pays you for your time, and
which of price, feed or losses decides it**, before ordering chicks.

## Try it

Open [`index.html`](index.html) and click **Project my season**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. A batch places
`birdsPerBatch` chicks; survivors are sold at `dressedLb` each, split between a
direct and a wholesale price per pound. Costs: chicks, feed (lost birds count
half), processing per bird, supplies, and your hours at your wage. A season is
`batches` batches less fixed costs and equipment spread over its life.
Break-even price covers labour, equipment and fixed costs.

## What this does not cover

Licensing, processing rules, disease, predators, weather, insurance, tax.
Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
