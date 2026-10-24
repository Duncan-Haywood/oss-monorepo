# Oyster Farm Growout Planner

A free browser tool (and small Node CLI) for oyster growers and people about to become one:
**enter seed, survival, growout months, gear, lease and prices by grade, and see net for the crop,
net per 1,000 oysters sold, the break-even price and survival, and the cash you need before the
first sale.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/oyster-farm-growout-planner/

After using this, you can now **tell whether a planting will pay and how much cash it ties up for
18 months**, which used to be a spreadsheet rebuilt for every lease and every seed order.

## Use

1. Open `index.html`, enter the crop (or load the example), click Plan the crop.
2. CLI: `node cli.mjs --seed 250000 --mortality 25 --months 20 --premium-price 0.85 --commission 10 [--json]`
   (exit 1 when the crop loses money or leaves under 15% of sales).

Not modelled: seed upsizing between gear types, harvest-closure days, price changes during growout,
taxes, grants and regulations. The tool holds no prices; the example numbers are made up. Not
business, legal or financial advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
