# Sheep and Goat Flock Profit Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sheep-goat-flock-profit-planner/>

A free browser tool for small sheep and meat-goat producers. Enter your ewes or
does, weaning rate, prices, hay and costs. It projects the flock and its profit
year by year, re-runs the plan at different weaning rates, hay prices and market
prices, compares selling at weaning against finishing and selling breeding
stock, and finds the flock size where the farm covers its fixed costs.
Entirely client-side; nothing is uploaded.

After using this, you can **see whether the flock pays, and which of weaning
rate, hay or price it depends on**, instead of guessing from the sale price.

## Try it

Open [`index.html`](index.html) (serve the folder, e.g. `python3 -m http.server`,
since it loads ES modules) and click **Project my flock**. Presets: wool sheep,
hair sheep, meat goats.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies. Each year: adult
deaths and culls; young weaned per breeding female; female young kept to refill
the flock up to the pasture limit; everything else sold at weaning, finished, or
as breeding stock. Costs are hay, grain, vet, creep, rams or bucks spread over
their life, hauling, fixed costs and setup depreciation. Cash payback leaves out
the value of animals you raised; the flock value is reported separately.

## What this does not cover

Animal health and parasites, nutrition, predators, genetics, identification and
slaughter/direct-sale rules, insurance, and tax. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
