# Apiary Profit Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/apiary-profit-planner/>

A free browser tool for beekeepers who sell. Enter your colonies, winter loss,
honey yield, prices and costs. It projects colonies, honey, nuc sales and
pollination income year by year, re-runs your plan at 10-60% winter loss,
compares honey-only against nucs and pollination, and finds the colony count
where the yard covers its fixed costs. Entirely client-side; nothing is uploaded.

After using this, you can **see whether expanding, selling nucs or renting
colonies actually pays**, instead of guessing from honey alone.

## Try it

Open [`index.html`](index.html) and click **Project my apiary**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies. Each year:
winter loss removes colonies; each survivor makes `splitRate` new colonies (some
fail); new colonies fill the yard up to its limit and the surplus is sold as
nucs. Only survivors make honey. Costs are per-colony husbandry, queens, jars,
fixed costs and equipment depreciation; new equipment is counted as cash when
bought. Profit per hour uses hours per colony plus selling and splitting time.

## What this does not cover

Colony health, disease and mites, swarming, forage, registration and inspection,
food-safety and labelling, insurance, and tax. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
